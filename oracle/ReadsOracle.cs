using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Coverage work package "reads": the read-only API of Aml.Engine on every object of every document
/// (see test/engine/reads.oracle.test.ts and docs/coverage-notes/reads.md).
///
///   reads <outDir> <file.aml|dir>...     writes <outDir>/<name>.jsonl per document
///
/// Every line of the output is one call: [target, kind, member, args, result, extra?]. The JS
/// runner replays the calls in the same order on the same document and compares the results.
/// Targets: an index into the snapshot of all CAEX elements taken right after loading
/// (document order), [index, property] for a sequence returned by a property, "doc", "qs"
/// (ServiceLocator.QueryService), null for static methods. Kinds: "p" property, "m" instance
/// method, "i" indexer, "s:Class" static method of a static class, "#" document checkpoint
/// (hash of the saved canonical text, written whenever the document changed since the last one),
/// "load" load/save variants, "val" Validate().
/// Members are selected by reflection (all public instance properties) and by the curated method
/// list below; arguments come from pools derived from the object and the document.
/// </summary>
public static class ReadsOracle
{
    static readonly Assembly Asm = typeof(CAEXDocument).Assembly;
    static readonly Dictionary<string, Type> Types = BuildTypes();

    static Dictionary<string, Type> BuildTypes()
    {
        var d = new Dictionary<string, Type>();
        foreach (var t in Asm.GetTypes())
        {
            if (!t.IsPublic && !t.IsNestedPublic) continue;
            d.TryAdd(t.Name, t);
            if (t.IsNested) d[t.DeclaringType!.Name + "+" + t.Name] = t;
        }
        foreach (var t in new[] { typeof(string), typeof(bool), typeof(int), typeof(object), typeof(Type), typeof(XElement),
                     typeof(XName), typeof(XNode), typeof(string[]), typeof(DateTime), typeof(double) })
            d[t.Name] = t;
        return d;
    }

    public static void Run(string[] args)
    {
        if (args[0] == "--list") { List(); return; }
        if (args[0] == "--savefile")
        {
            // debugging aid: reads --savefile <in.aml> <out> (SaveToFile of LoadFromString)
            CAEXDocument.LoadFromString(File.ReadAllText(args[1], Encoding.UTF8)).SaveToFile(args[2], true);
            return;
        }
        var outDir = args[0];
        Directory.CreateDirectory(outDir);
        var files = args.Skip(1).SelectMany<string, string>(a => Directory.Exists(a)
            ? Directory.GetFiles(a).Where(f => f.EndsWith(".aml")).OrderBy(f => f, StringComparer.Ordinal)
            : new[] { a }).ToList();
        // documents with cyclic references run in child processes, several at a time (RunIsolated)
        var isolated = Environment.GetEnvironmentVariable("READS_CHILD") == null ? files.Where(IsCyclic).ToList() : new List<string>();
        var isolatedRuns = Task.Run(() => Parallel.ForEach(isolated, new ParallelOptions { MaxDegreeOfParallelism = Math.Max(2, Environment.ProcessorCount / 2) }, f => RunIsolated(outDir, f)));
        foreach (var file in files.Except(isolated))
        {
            var name = Path.GetFileNameWithoutExtension(file);
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var lines = new Ctx(file).RunFile();
            File.WriteAllLines(Path.Combine(outDir, name + ".jsonl"), lines);
            Console.WriteLine($"{name}\t{lines.Count}\t{sw.ElapsedMilliseconds} ms");
            if (Environment.GetEnvironmentVariable("READS_PROFILE") != null)
            {
                foreach (var (k, v) in Ctx.Profile.OrderByDescending(x => x.Value).Take(25))
                    Console.WriteLine($"   {v / (System.Diagnostics.Stopwatch.Frequency / 1000)} ms\t{k}");
                Ctx.Profile.Clear();
                foreach (var (k, v) in Ctx.Mutators.OrderByDescending(x => x.Value))
                    Console.WriteLine($"   mutates {v}	{k}");
                Ctx.Mutators.Clear();
            }
        }
        isolatedRuns.Wait();
    }

    // ------------------------------------------------------------------------------------------
    // Method specs: kind, declaring type, name, parameter type names ("<T>" suffix on the name:
    // generic method whose type argument is passed; "<~>": type argument inferred from `this`).
    // Kinds: M instance method on the object, X extension/static with the object as first
    // argument, S static without the object (arguments from pools, run on objects with
    // references), Q QueryService method (the object in the first parameter that accepts it),
    // D document level (run once).
    // ------------------------------------------------------------------------------------------
    static readonly string[] Specs =
    {
        // CAEXWrapper / CAEXBasicObject / CAEXObject
        "M CAEXWrapper.CAEXChild(String)",
        "M CAEXWrapper.CAEXChildren(String)",
        "M CAEXWrapper.GetXAttributeValue(XName)",
        "M CAEXWrapper.Equals(Object)",
        "M CAEXBasicObject.CAEXSequence(ICAEXWrapper)",
        "M CAEXBasicObject.Container<T>()",
        "M CAEXObject.CAEXPath()",
        "M CAEXObject.ToString()",
        // wrapper types
        "M AttributeTypeType.IsInherited(IObjectWithAttributes)",
        "M AttributeNameMappingType.RoleClassMappingElements(Boolean)",
        "M InterfaceIDMappingType.RoleClassMappingElements(Boolean)",
        "M InterfaceNameMappingType.RoleClassMappingElements(Boolean)",
        "M CAEXFileType.GetFileNamePath()",
        "M CaexObjectWithReference`1.CanAddReference(CAEXObject)",
        "M ExternalInterfaceType.HasInterfaceClassReference(InterfaceFamilyType,Boolean)",
        "M ExternalReferenceType.PathAreEqual(String)",
        "M InterfaceFamilyType.GetReferenceHierarchy(Boolean)",
        "M RoleFamilyType.GetReferenceHierarchy(Boolean)",
        "M SystemUnitFamilyType.GetReferenceHierarchy(Boolean)",
        "M AttributeFamilyType.GetReferenceHierarchy(Boolean)",
        "M InternalElementType.HasGenericRoleClassReference(RoleFamilyType)",
        "M InternalElementType.HasGenericRoleClassReference(String)",
        "M InternalElementType.HasRoleClassReference(RoleFamilyType,Boolean)",
        "M InternalElementType.HasRoleClassReference(String,Boolean)",
        "M InternalElementType.HasSystemUnitClassReference(SystemUnitFamilyType,Boolean)",
        "M InternalLinkType.InterfaceFromAttributeValue(String)",
        "M RoleRequirementsType.HasRoleClassReference(RoleFamilyType,Boolean)",
        "M RoleRequirementsType.IsAssignableRoleClassAttribute(AttributeType)",
        "M RoleRequirementsType.IsAssignableRoleClassInterface(ExternalInterfaceType)",
        "M SystemUnitClassType.HasInterfaceClassReference(InterfaceFamilyType,Boolean)",
        "M SystemUnitClassType.LowestCommonParent(SystemUnitClassType)",
        "M SystemUnitClassType.SupportedRoleClassWithName(String)",
        "M SystemUnitFamilyType.GetInheritedSupportedRoles()",
        "M SystemUnitFamilyType.GetReferencedSystemUnitClass(String)",
        "M SystemUnitFamilyType.HasGenericRoleClassReference(RoleFamilyType)",
        "M SystemUnitFamilyType.HasGenericRoleClassReference(RoleRequirementsType)",
        "M SystemUnitFamilyType.HasRoleClassReference(RoleFamilyType,Boolean)",
        "M SystemUnitFamilyType.HasRoleClassReference(String,Boolean)",
        "M AttributeSequence.GetCAEXAttribute(String)",
        // AMLEngineAdapter
        "X AMLEngineAdapter.AllElementsWithInternalLinks(CAEXFileType)",
        "X AMLEngineAdapter.AllInternalElementsWithInternalLinks(CAEXFileType)",
        "X AMLEngineAdapter.Ancestors(SystemUnitClassType)",
        "X AMLEngineAdapter.Attributes(IObjectWithAttributes)",
        "X AMLEngineAdapter.ConsistencyCheck_ClassReference(CAEXBasicObject,String)",
        "X AMLEngineAdapter.ExternalInterfaces(IObjectWithExternalInterface)",
        "X AMLEngineAdapter.ExternalReferences(CAEXFileType)",
        "X AMLEngineAdapter.findExternalInterface(IObjectWithExternalInterface,String)",
        "X AMLEngineAdapter.findInternalElement(CAEXBasicObject,String)",
        "X AMLEngineAdapter.GetAllElementsWithInternalLinks(CAEXFileType)",
        "X AMLEngineAdapter.getAttributeField(IObjectWithAttributes)",
        "X AMLEngineAdapter.GetClassName(InternalElementType)",
        "X AMLEngineAdapter.GetClassName(InterfaceClassType)",
        "X AMLEngineAdapter.GetExternalInterfaces(IObjectWithExternalInterface,String)",
        "X AMLEngineAdapter.getLinkedObjects(SystemUnitClassType)",
        "X AMLEngineAdapter.Name(CAEXBasicObject)",
        "X AMLEngineAdapter.getReferencedClass(CAEXBasicObject,String)",
        "X AMLEngineAdapter.getReferencedGUID(CAEXBasicObject,String)",
        "X AMLEngineAdapter.GetAttributeValue(IObjectWithAttributes,String)",
        "X AMLEngineAdapter.getReferencedInterfaceClass(CAEXBasicObject,String)",
        "X AMLEngineAdapter.getReferencedInterfaceName(CAEXBasicObject,String)",
        "X AMLEngineAdapter.getReferencedSystemUnitClass(InternalElementType)",
        "X AMLEngineAdapter.InstanceHierarchies(CAEXFileType)",
        "X AMLEngineAdapter.InterfaceClassLibraries(CAEXFileType)",
        "X AMLEngineAdapter.InternalElementChildren(IInternalElementContainer)",
        "X AMLEngineAdapter.IsFacet(InternalElementType)",
        "X AMLEngineAdapter.IsGroup(InternalElementType)",
        "X AMLEngineAdapter.IsPort(InternalElementType)",
        "X AMLEngineAdapter.RoleClassLibraries(CAEXFileType)",
        "X AMLEngineAdapter.SystemUnitClassChildren(SystemUnitFamilyType)",
        "X AMLEngineAdapter.SystemUnitClassLibraries(CAEXFileType)",
        "S AMLEngineAdapter.GetParent(CAEXFileType,CAEXBasicObject)",
        // CAEX_CLASSModel_TagNames
        "S CAEX_CLASSModel_TagNames.TagName(Type)",
        // AttributeTypeTypeExtensions
        "X AttributeTypeTypeExtensions.IsMaster(AttributeType)",
        "X AttributeTypeTypeExtensions.IsOverridden(AttributeType)",
        "X AttributeTypeTypeExtensions.IsOverriddenDeleted(AttributeType)",
        "X AttributeTypeTypeExtensions.HasAMLID(AttributeTypeType,String)",
        "X AttributeTypeTypeExtensions.IsPartOfDateValue(AttributeTypeType)",
        "X AttributeTypeTypeExtensions.TypeCodeOfAttribute(AttributeTypeType)",
        "X AttributeTypeTypeExtensions.IsNumericDataType(AttributeTypeType)",
        "X AttributeTypeTypeExtensions.IsBooleanDataType(AttributeTypeType)",
        "X AttributeTypeTypeExtensions.IsStringDataType(AttributeTypeType)",
        "X AttributeTypeTypeExtensions.IsDateTimeType(AttributeTypeType)",
        // CAEXBasicObjectExtensions
        "X CAEXBasicObjectExtensions.AllLibraryReferences(CAEXBasicObject)",
        "X CAEXBasicObjectExtensions.AMLSchemaManager(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.Ancestors(ICAEXWrapper,Boolean)",
        "X CAEXBasicObjectExtensions.Ancestors<T>(ICAEXWrapper,Boolean)",
        "X CAEXBasicObjectExtensions.HasOldVersion(CAEXBasicObject)",
        "X CAEXBasicObjectExtensions.IsExtendedVersion(ICAEXLibrary)",
        "X CAEXBasicObjectExtensions.AutomationMLEdition(CAEXBasicObject)",
        "X CAEXBasicObjectExtensions.HasNewVersion(CAEXBasicObject)",
        "X CAEXBasicObjectExtensions.CAEXDocument(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.CAEXFile(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.CAEXSchema(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.Descendants(CAEXWrapper)",
        "X CAEXBasicObjectExtensions.Descendants<T>(ICAEXWrapper,Boolean)",
        "X CAEXBasicObjectExtensions.FindCaexObjectFromId<T>(ICAEXWrapper,String)",
        "X CAEXBasicObjectExtensions.FindReferencedClass<T>(ICAEXWrapper,String)",
        "X CAEXBasicObjectExtensions.FirstAncestor<T>(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.FirstAncestor(ICAEXWrapper,String)",
        "X CAEXBasicObjectExtensions.GetParent<T>(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.Library(ICAEXWrapper)",
        "X CAEXBasicObjectExtensions.Name(ICAEXWrapper)",
        // CAEXFileTypeExtensions
        "X CAEXFileTypeExtensions.FindFastByID(CAEXFileType,String,Boolean)",
        "X CAEXFileTypeExtensions.FindFastByID<T>(CAEXFileType,String,Boolean)",
        "X CAEXFileTypeExtensions.FindFastByPath(CAEXFileType,String,Boolean)",
        "X CAEXFileTypeExtensions.FindFastByPath<T>(CAEXFileType,String,Boolean)",
        "X CAEXFileTypeExtensions.GetAMLInfoFromFilename(CAEXFileType,String&,String&,String&,String&,String&,String&)",
        // CAEXObjectExtensions
        "X CAEXObjectExtensions.GetFullNodePath(ICAEXObject)",
        "X CAEXObjectExtensions.IsNewVersion(CAEXObject,CAEXObject)",
        "X CAEXObjectExtensions.OldVersions(CAEXBasicObject)",
        "X CAEXObjectExtensions.NewVersions(CAEXBasicObject)",
        "X CAEXObjectExtensions.OldRevisions(CAEXBasicObject)",
        "X CAEXObjectExtensions.Extensions(CAEXBasicObject)",
        "X CAEXObjectExtensions.SemanticVersion(ICAEXBasicObject,String)",
        "X CAEXObjectExtensions.HasNewVersion(CAEXBasicObject,String)",
        "X CAEXObjectExtensions.IsExtendedVersion(CAEXObject,CAEXObject)",
        // CAEXPathBuilder
        "X CAEXPathBuilder.ExternalPath(CAEXObject,String)",
        "S CAEXPathBuilder.AliasFromReference(String,CAEXSchema)",
        "S CAEXPathBuilder.CAEXPath(IEnumerable`1:CAEXObject)",
        "S CAEXPathBuilder.CAEXPath(IEnumerable`1:XElement)",
        "S CAEXPathBuilder.CAEXPath(String[],CAEXSchema)",
        "S CAEXPathBuilder.CanNormalize(String)",
        "S CAEXPathBuilder.ChangeAlias(String,String,String)",
        "S CAEXPathBuilder.ChangePathStart(String,String,String)",
        "S CAEXPathBuilder.ContainsPathSeparatorChars(String,CAEXDocument)",
        "S CAEXPathBuilder.ExternalInterfaceIDInAttributeReference(String,CAEXDocument,Boolean&)",
        "S CAEXPathBuilder.InstanceIDInAttributeReference(String,CAEXDocument,Boolean&)",
        "S CAEXPathBuilder.InternalElementIDInInternalLinkReference(String,Boolean&)",
        "S CAEXPathBuilder.InternalLinkReferencePath(SystemUnitClassType,InterfaceClassType)",
        "S CAEXPathBuilder.InternalLinkReferencePath(XElement,XElement)",
        "S CAEXPathBuilder.IsAlias(String)",
        "S CAEXPathBuilder.IsAttributeReference(CAEXDocument,String)",
        "S CAEXPathBuilder.IsIDReferenceWithAlias(String,CAEXDocument,IDRefEnum)",
        "S CAEXPathBuilder.IsInterfaceReference(String)",
        "S CAEXPathBuilder.IsObjectReferenceWithAlias(String,String,CAEXSchema)",
        "S CAEXPathBuilder.IsReferenceWithAlias(String,CAEXSchema)",
        "S CAEXPathBuilder.IsValidAttributeReferenceID(String,CAEXDocument)",
        "S CAEXPathBuilder.IsValidID(String,CAEXDocument)",
        "S CAEXPathBuilder.NormalizePath(String,Boolean&,CAEXSchema)",
        "S CAEXPathBuilder.PathNameArray(String,CAEXSchema,Boolean)",
        "S CAEXPathBuilder.PathNameArrayWithSeparator(String,CAEXSchema,Boolean)",
        "S CAEXPathBuilder.PathNameListWithSeparator(String,CAEXSchema,Boolean)",
        "X CAEXPathBuilder.PathPart(CAEXObject,Boolean)",
        "S CAEXPathBuilder.PathPart(XElement,Boolean)",
        "S CAEXPathBuilder.PathPartName(String,CAEXSchema)",
        "S CAEXPathBuilder.PathPartObjectNames(String,CAEXSchema,Boolean)",
        "S CAEXPathBuilder.PathPartObjectNamesWithSeparator(String,CAEXSchema,Boolean)",
        "X CAEXPathBuilder.PathPartSeparator(CAEXObject)",
        "S CAEXPathBuilder.PathPartSeparator(XElement)",
        "S CAEXPathBuilder.RemoveAlias(String,String)",
        "S CAEXPathBuilder.SeparatorChars(CAEXSchema)",
        // ExternalInterfaceTypeExtensions
        "X ExternalInterfaceTypeExtensions.HasVerifiableCardinality(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.HasVerifiableCategory(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.HasVerifiableDirection(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.AllowedDirections(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.IsMaster(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.IsOverridden(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.IsOverriddenDeleted(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.IsRelated(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.Categories(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.Direction(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.MaxCardinality(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.MaxCardinalityViolation(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.MinCardinality(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.MinCardinalityViolation(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.DirectionViolation(ExternalInterfaceType,String[]&)",
        "X ExternalInterfaceTypeExtensions.CategoryViolation(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.OfInterfaceClass(IObjectWithExternalInterface,String)",
        "X ExternalInterfaceTypeExtensions.RelatedExternalInterfaces(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.RelatedInstances(ExternalInterfaceType)",
        "X ExternalInterfaceTypeExtensions.RelatedInternalElementsWithRoleReference(ExternalInterfaceType,String)",
        // InheritanceExtensions
        "X InheritanceExtensions.ClassIsDerivedFrom(IClassWithBaseClassReference,String!)",
        "X InheritanceExtensions.ClassIsDerivedFrom<~>(IClassWithBaseClassReference`1,IClassWithBaseClassReference`1)",
        "D InheritanceExtensions.ClassIsDerivedFrom<T>(CAEXDocument,String,String)",
        "X InheritanceExtensions.IsDerivedFromAttributeType(AttributeTypeType,String)",
        "X InheritanceExtensions.IsDerivedFromInterfaceClass(InterfaceClassType,String)",
        "X InheritanceExtensions.IsDerivedFromRoleClass(IObjectWithRoleReference,String)",
        // descendants of libraries and classes
        "X InstanceHierarchyTypeExtensions.InternalElementDescendants(InstanceHierarchyType)",
        "X InterfaceClassLibTypeExtensions.InterfaceClassDescendants(InterfaceClassLibType)",
        "X InterfaceFamilyTypeExtensions.InterfaceClassDescendants(InterfaceFamilyType)",
        "X RoleClassFamilyTypeExtensions.RoleClassDescendants(RoleFamilyType)",
        "X RoleClassLibTypeExtensions.RoleClassDescendants(RoleClassLibType)",
        "X SystemUnitClassLibTypeExtensions.SystemUnitClassDescendants(SystemUnitClassLibType)",
        "X SystemUnitFamilyTypeExtensions.SystemUnitClassDescendants(SystemUnitFamilyType)",
        "X SystemUnitFamilyTypeExtensions.GetDerivedSupportedRoles(SystemUnitFamilyType,Boolean)",
        "X SystemUnitClassTypeExtensions.Ancestors(SystemUnitFamilyType)",
        // InternalElementExtensions, InternalLinkTypeExtensions
        "X InternalElementExtensions.IsMaster(InternalElementType)",
        "X InternalElementExtensions.IsOverridden(InternalElementType)",
        "X InternalElementExtensions.IsOverriddenDeleted(InternalElementType)",
        "X InternalLinkTypeExtensions.GetRefPartnerSideAExternalInterfaceId(InternalLinkType)",
        "X InternalLinkTypeExtensions.GetRefPartnerSideAInternalElementId(InternalLinkType)",
        "X InternalLinkTypeExtensions.GetRefPartnerSideBExternalInterfaceId(InternalLinkType)",
        "X InternalLinkTypeExtensions.GetRefPartnerSideBInternalElementId(InternalLinkType)",
        // ObjectWithAttributes / ObjectWithBaseClass / ObjectWithExternalInterface
        "X ObjectWithAttributes.GetAttribute(IObjectWithAttributes,String)",
        "X ObjectWithBaseClass.GetDerivedAttributes(IClassWithBaseClassReference,Boolean)",
        "X ObjectWithBaseClass.GetDerivedInterfaces(IClassWithExternalInterface,Boolean)",
        "X ObjectWithBaseClass.GetInheritedAttributes(IClassWithBaseClassReference,Boolean)",
        "X ObjectWithBaseClass.GetInheritedAttributesAndDescendants(IClassWithBaseClassReference,Boolean)",
        "X ObjectWithBaseClass.GetInheritedElements(SystemUnitFamilyType,Boolean)",
        "X ObjectWithBaseClass.GetInheritedInterfaces(IClassWithExternalInterface,Boolean)",
        "X ObjectWithBaseClass.GetInheritedInterfacesAndDescendants(IClassWithExternalInterface,Boolean)",
        "X ObjectWithBaseClass.InheritedElements<T>(IClassWithBaseClassReference,Boolean)",
        "X ObjectWithBaseClass.IsInherited(IClassWithBaseClassReference,CAEXBasicObject)",
        "X ObjectWithBaseClass.IsOverridden(IClassWithBaseClassReference,CAEXBasicObject)",
        "X ObjectWithBaseClass.OverriddenElement(IClassWithBaseClassReference,String,Type)",
        "X ObjectWithBaseClass.ReferencedClassName(IClassWithBaseClassReference)",
        "X ObjectWithBaseClass.ReferencedClassName(InternalElementType)",
        "X ObjectWithBaseClass.ReferencedClassName(InterfaceClassType)",
        "X ObjectWithExternalInterface.HasInterfaceClassReference(IObjectWithExternalInterface,InterfaceFamilyType,Boolean)",
        "X ObjectWithExternalInterface.HasInterfaceClassReference(IObjectWithExternalInterface,String,Boolean)",
        "X ObjectWithExternalInterface.InterfaceClassReferences(IObjectWithExternalInterface,String,Boolean)",
        // StringExtensions (on reference strings of the object)
        "S StringExtensions.IsClassReference(String)",
        "S StringExtensions.IsInternalLinkAttribute(String)",
        "S StringExtensions.IsGUID(String,Boolean)",
        "S StringExtensions.IsInterfacePath(String)",
        "S StringExtensions.IsInterfacePathWithID(String,String,CAEXSchema)",
        "S StringExtensions.IsInterfacePathWithInterface(String,String,CAEXSchema)",
        "S StringExtensions.NormalizedGUID(String)",
        // Linq
        "X CAEXSequenceExtension.OfInterfaceClass(ExternalInterfaceSequence,InterfaceFamilyType)",
        // QueryResult (document level and per object)
        "Q QueryResult.InternalElementMirrors(InternalElementType)",
        "Q QueryResult.InternalLinksToElement(SystemUnitClassType)",
        "Q QueryResult.InternalLinksToInterface(ExternalInterfaceType)",
        "D QueryResult.AllElementsIdentifiedByCAEXPath(CAEXDocument)",
        "D QueryResult.AllElementsWithAliasReference(CAEXDocument)",
        "D QueryResult.AllElementsWithCAEXPathReference(CAEXDocument)",
        "D QueryResult.AllElementsWithIDReference(CAEXDocument)",
        "D QueryResult.AllElementsWithIDs(CAEXDocument)",
        "D QueryResult.AllElementsWithNameReference(CAEXDocument)",
        "D QueryResult.AllInternalElementMasters(CAEXDocument)",
        "D QueryResult.AllInternalElementMirrors(CAEXDocument)",
        "D QueryResult.ElementsWithInternalLinkRelations(CAEXDocument)",
        "R QueryResult.ElementsWithAliasReference(CAEXDocument,String)",
        "R QueryResult.ElementsWithCAEXPathReference(CAEXDocument,String)",
        "R QueryResult.ElementsWithIDReference(CAEXDocument,String)",
        // QueryService
        "Q IQuery.AllClassReferences(CAEXObject)",
        "Q IQuery.AllClassReferencesDeep(CAEXObject)",
        "Q IQuery.AllElementsIdentifiedByCAEXPath(CAEXBasicObject)",
        "Q IQuery.AllElementsWithAliasReference(CAEXBasicObject,String)",
        "Q IQuery.AllElementsWithCAEXPathReference(CAEXBasicObject,String,Boolean)",
        "Q IQuery.AllElementsWithIDReference(CAEXBasicObject,String)",
        "Q IQuery.AllElementsWithIDs(CAEXBasicObject,String)",
        "Q IQuery.AllElementsWithInternalLinks(CAEXBasicObject)",
        "Q IQuery.AllElementsWithNameReference(CAEXBasicObject,String)",
        "Q IQuery.AllExternalDataReferences(CAEXDocument,CAEXBasicObject)",
        "Q IQuery.AllExternalInterfacesOfType(CAEXDocument,String,CAEXBasicObject)",
        "Q IQuery.AllInternalElementsWithInternalLinks(CAEXBasicObject)",
        "Q IQuery.AttributeMirrors(AttributeType)",
        "Q IQuery.ElementsWithAliasReference(CAEXBasicObject,String,String)",
        "Q IQuery.ElementsWithCAEXPathReference(CAEXBasicObject,String,String)",
        "Q IQuery.ElementsWithIDReference(CAEXBasicObject,String,String)",
        "Q IQuery.ElementsWithInternalLinkRelations(CAEXBasicObject)",
        "Q IQuery.ExternalInterfaceMirrors(ExternalInterfaceType)",
        "Q IQuery.FindByID(CAEXDocument,String,Boolean,Type)",
        "Q IQuery.FindByPath(CAEXDocument,String,Boolean,Type)",
        "Q IQuery.InterfacesWithInternalLinkRelations(CAEXBasicObject)",
        "Q IQuery.InternalElementMirrors(InternalElementType)",
        "Q IQuery.InternalLinksToElement(SystemUnitClassType)",
        "Q IQuery.InternalLinksToInterface(ExternalInterfaceType)",
        "Q IQuery.IsMaster(InternalElementType)",
        "Q IQuery.IsMaster(ExternalInterfaceType)",
        "Q IQuery.IsMaster(AttributeType)",
        "Q IQuery.IsReferenced(CAEXObject)",
        "D IQuery.AllClassReferences(CAEXDocument,String,String)",
        "D IQuery.AllClassReferencesDeep(CAEXDocument,String,String)",
        // CAEXDocument, CAEXDocumentExtensions
        "D CAEXDocument.XName(String)",
        "D CAEXDocument.SchemaToString(CAEXSchema)",
        "D CAEXDocument.AMLSchemaManager(XElement)",
        "D CAEXDocument.Document(XNode)",
        "D CAEXDocumentExtensions.IsExtensionDocument(CAEXDocument)",
        "D CAEXDocumentExtensions.HasLibraries(CAEXDocument)",
        "D CAEXDocumentExtensions.ExternalReferenceFromAlias(CAEXDocument,String)",
        "X CAEXDocumentExtensions.FindByID(CAEXDocument,String,Boolean,Type)",
        "X CAEXDocumentExtensions.FindByPath(CAEXDocument,String,Boolean,Type)",
        "S ExternalReferenceType.PathAreEqual(String,String)",
    };

    /// <summary>Properties not recorded: attribute values (package "values"), infrastructure.</summary>
    static readonly HashSet<string> SkipProps = new()
    {
        "AttributeValue", "DefaultAttributeValue", "ValueAttributes", "ValueConverter",
        "PropertyChanged", "AssociatedCAEXDocument",
    };

    sealed record Spec(char Kind, Type Decl, MethodInfo Method, string Name, string Generic, bool NoNull);

    static List<Spec>? _specs;

    static List<Spec> ParsedSpecs()
    {
        if (_specs != null) return _specs;
        var list = new List<Spec>();
        foreach (var s in Specs)
        {
            var m = Regex.Match(s, @"^(\w) ([\w`+]+)\.(\w+)(<[T~]>)?\((.*)\)$");
            if (!m.Success) throw new Exception("bad spec " + s);
            var kind = m.Groups[1].Value[0];
            var decl = Types[m.Groups[2].Value];
            var name = m.Groups[3].Value;
            var generic = m.Groups[4].Value;
            var ps = m.Groups[5].Value.Length == 0 ? Array.Empty<string>() : m.Groups[5].Value.Split(',');
            var noNull = ps.Any(p => p.EndsWith("!"));
            ps = ps.Select(p => p.TrimEnd('!')).ToArray();
            var cands = decl.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static)
                .Where(x => x.Name == name && x.GetParameters().Length == ps.Length && x.IsGenericMethodDefinition == (generic != ""))
                .Where(x => x.GetParameters().Select(p => PName(p.ParameterType)).SequenceEqual(ps))
                .ToList();
            if (cands.Count == 0 && decl.IsInterface)
                cands = decl.GetInterfaces().SelectMany(i => i.GetMethods())
                    .Where(x => x.Name == name && x.GetParameters().Select(p => PName(p.ParameterType)).SequenceEqual(ps)).ToList();
            if (cands.Count > 1) cands = cands.Where(x => x.ReturnType.Name != "Queue`1").ToList();
            if (cands.Count == 0) throw new Exception("no method for spec " + s);
            list.Add(new Spec(kind, decl, cands[0], name, generic, noNull));
        }
        return _specs = list;
    }

    static string PName(Type t)
    {
        if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(IEnumerable<>))
            return "IEnumerable`1:" + t.GetGenericArguments()[0].Name;
        return t.Name;
    }

    static readonly Type[] GenericArgs =
    {
        typeof(CAEXObject), typeof(InternalElementType), typeof(SystemUnitFamilyType), typeof(RoleFamilyType),
        typeof(InterfaceFamilyType), typeof(AttributeFamilyType), typeof(AttributeType), typeof(ExternalInterfaceType),
        typeof(InstanceHierarchyType), typeof(SystemUnitClassLibType), typeof(RoleClassLibType), typeof(InterfaceClassLibType),
        typeof(AttributeTypeLibType), typeof(RoleRequirementsType), typeof(SupportedRoleClassType), typeof(InternalLinkType),
        typeof(CAEXBasicObject), typeof(SystemUnitClassType), typeof(InterfaceClassType), typeof(RoleClassType),
    };

    // ------------------------------------------------------------------------------------------
    sealed class Ctx
    {
        readonly string _file;
        CAEXDocument _doc = null!;
        List<XElement> _snap = new();
        readonly Dictionary<XElement, int> _snapIndex = new();
        readonly Canonicalizer _canon = new();
        readonly List<string> _out = new();
        bool _dirty, _changed;
        public static readonly Dictionary<string, int> Mutators = new();
        List<string> _classPaths = new(), _ids = new(), _aliases = new(), _refs = new(), _names = new();

        public Ctx(string file) { _file = file; }

        string RelFile => Path.GetRelativePath(Directory.GetCurrentDirectory(), _file).Replace('\\', '/');

        public List<string> RunFile()
        {
            // new IDs come from a counter so that arguments taken from the walked document (paths
            // containing generated IDs) are the same in the JS runner
            ServiceLocator.Register<ICaexIDService>(new CountingIDService());
            var text = File.ReadAllText(_file, Encoding.UTF8);
            Loads(text);
            CountingIDService.Paused = false;
            _doc = CAEXDocument.LoadFromString(text);
            CountingIDService.Paused = true;
            if (_doc == null) { Emit(null, "load", "null", new JsonArray(), null); return _out; }
            _guard = Path.GetFileName(_file).StartsWith("cyclic");
            _doc.XDocument.Changed += (_, _) => { _dirty = true; _changed = true; };
            CountingIDService.Paused = false;
            _snap = _doc.XDocument.Root!.DescendantsAndSelf().Where(e => e.CreateCAEXWrapper() != null).ToList();
            CountingIDService.Paused = true;
            for (var i = 0; i < _snap.Count; i++) _snapIndex[_snap[i]] = i;
            // arguments come from the loaded state only (reads may assign random IDs later)
            _init = _snap.Select(e => e.Attributes().Select(a => (a.Name.LocalName, a.Value)).ToList()).ToList();
            BuildPools();
            // everything up to here is the same in every run of a cyclic document (no guarded call yet)
            if (_guard && Environment.GetEnvironmentVariable("READS_SKIP_STDIN") != null) Skipped = ParseSkip(Console.ReadLine());
            Emit(null, "snap", "count", new JsonArray(), _snap.Count);
            DocumentLevel();
            Checkpoint();
            for (var i = 0; i < _snap.Count; i++)
            {
                ObjectReads(i);
                Checkpoint();
            }
            DocumentLevel();
            Checkpoint();
            Streaming();
            // Validation after the full read walk (and the save of the walked document).
            try
            {
                var ok = _doc.Validate(out var log);
                Emit("doc", "val", "Validate", new JsonArray(), new JsonObject { ["result"] = ok, ["log"] = new JsonArray(log.Select(l => (JsonNode?)l).ToArray()) });
            }
            catch (Exception e) { Emit("doc", "val", "Validate", new JsonArray(), "!" + Unwrap(e).GetType().Name); }
            Emit(null, "final", "save", new JsonArray(), _canon.Apply(Save(_doc, true)));
            _doc.Unload();
            return _out;
        }

        // ---------------------------------------------------------------- load / save variants
        void Loads(string text)
        {
            var bytes = File.ReadAllBytes(_file);
            var full = Path.GetFullPath(_file);
            void Variant(string name, Func<CAEXDocument?> load)
            {
                CAEXDocument? d;
                CountingIDService.Paused = false;
                try { d = load(); }
                catch (Exception e) { Emit(null, "load", name, new JsonArray(), "!" + Unwrap(e).GetType().Name); return; }
                if (d == null) { Emit(null, "load", name, new JsonArray(), null); return; }
                var r = new JsonObject();
                r["filePath"] = d.FilePath == null ? null : (d.FilePath == full ? "<file>" : "<other>");
                r["pretty"] = Try(() => Hash(Save(d, true)));
                r["plain"] = Try(() => Hash(Save(d, false)));
                r["file"] = Try(() =>
                {
                    var tmp = TmpFile();
                    d.SaveToFile(tmp, true);
                    var h = Hash(File.ReadAllBytes(tmp));
                    File.Delete(tmp);
                    return h;
                });
                r["filePlain"] = Try(() =>
                {
                    var tmp = TmpFile();
                    d.SaveToFile(tmp, false);
                    var h = Hash(File.ReadAllBytes(tmp));
                    File.Delete(tmp);
                    return h;
                });
                r["async"] = Try(() =>
                {
                    using var s = d.SaveToStreamAsync(true).GetAwaiter().GetResult();
                    s.Position = 0;
                    using var ms = new MemoryStream();
                    s.CopyTo(ms);
                    return Hash(ms.ToArray());
                });
                Emit(null, "load", name, new JsonArray(), r);
                // documents stay registered in a static table until unloaded: keep only the walked one
                d.Unload();
                CountingIDService.Paused = true;
            }
            Variant("LoadFromString", () => CAEXDocument.LoadFromString(text));
            Variant("LoadFromFile", () => CAEXDocument.LoadFromFile(_file));
            Variant("LoadFromBinary", () => CAEXDocument.LoadFromBinary(bytes));
            Variant("LoadFromStream", () => CAEXDocument.LoadFromStream(new MemoryStream(bytes)));
            Variant("LoadFromStringAsync", () => CAEXDocument.LoadFromStringAsync(text).GetAwaiter().GetResult());
            Variant("LoadFromFileAsync", () => CAEXDocument.LoadFromFileAsync(_file).GetAwaiter().GetResult());
            Variant("LoadFromBinaryAsync", () => CAEXDocument.LoadFromBinaryAsync(bytes).GetAwaiter().GetResult());
            Variant("LoadFromStreamAsync", () => CAEXDocument.LoadFromStreamAsync(new MemoryStream(bytes)).GetAwaiter().GetResult());
        }

        void Streaming()
        {
            var rel = RelFile;
            var bytes = File.ReadAllBytes(_file);
            JsonNode? St(Func<IEnumerable> f) => TryNode(() => StreamList(f()));
            Emit(null, "s:DocumentStreaming", "ReadExternalReferenceType", new JsonArray(new JsonObject { ["file"] = rel }),
                St(() => Aml.Engine.Streaming.DocumentStreaming.ReadExternalReferenceType(Path.GetFullPath(_file))));
            Emit(null, "s:DocumentStreaming", "ReadExternalReferenceType", new JsonArray(new JsonObject { ["bytes"] = rel }),
                St(() => Aml.Engine.Streaming.DocumentStreaming.ReadExternalReferenceType(new MemoryStream(bytes))));
            foreach (var name in new[] { "InternalElement", "SystemUnitClass", "RoleClass", "InterfaceClass", "AttributeType", "SourceDocumentInformation", "InstanceHierarchy", "Revision", "Nope" })
            {
                foreach (var pred in new[] { (string?)null, "InstanceHierarchy", "SystemUnitClassLib" })
                {
                    Predicate<string>? p = pred == null ? null : n => n == pred;
                    JsonNode? pn = pred == null ? null : new JsonObject { ["pred"] = pred };
                    Emit(null, "s:DocumentStreaming", "StreamElementWithName", new JsonArray(new JsonObject { ["file"] = rel }, new JsonObject { ["s"] = name }, pn),
                        St(() => Aml.Engine.Streaming.DocumentStreaming.StreamElementWithName(Path.GetFullPath(_file), name, p)));
                    Emit(null, "s:DocumentStreaming", "StreamElementWithName", new JsonArray(new JsonObject { ["bytes"] = rel }, new JsonObject { ["s"] = name }, pn?.DeepClone()),
                        St(() => Aml.Engine.Streaming.DocumentStreaming.StreamElementWithName(new MemoryStream(bytes), name, p)));
                }
            }
            Emit(null, "s:DocumentStreaming", "NewDocumentVersions", new JsonArray(new JsonObject { ["file"] = rel }),
                St(() => Aml.Engine.Streaming.DocumentStreaming.NewDocumentVersions(Path.GetFullPath(_file))));
            Emit(null, "s:DocumentStreaming", "OldDocumentVersions", new JsonArray(new JsonObject { ["file"] = rel }),
                St(() => Aml.Engine.Streaming.DocumentStreaming.OldDocumentVersions(Path.GetFullPath(_file))));
        }

        /// <summary>Streamed elements are detached: recorded with their XML text.</summary>
        JsonNode StreamList(IEnumerable seq)
        {
            var a = new JsonArray();
            foreach (var x in seq)
                a.Add(x switch
                {
                    null => null,
                    CAEXWrapper w => (JsonNode)("w:" + TypeName(w.GetType()) + ":" + w.Node?.ToString(SaveOptions.DisableFormatting)),
                    string s => s,
                    _ => "o:" + TypeName(x.GetType()),
                });
            return a;
        }

        // ---------------------------------------------------------------- pools
        void BuildPools()
        {
            var classPaths = new List<string>();
            var ids = new List<string>();
            var names = new List<string>();
            foreach (var e in _snap)
            {
                var w = e.CreateCAEXWrapper();
                if (w is CAEXObject co)
                {
                    if (w is IClassWithBaseClassReference || w is CAEXLibrary<CAEXObject> || e.Name.LocalName.EndsWith("Lib"))
                        classPaths.Add(Try2(() => co.CAEXPath()) ?? "");
                    var id = e.Attribute("ID")?.Value;
                    if (!string.IsNullOrEmpty(id)) ids.Add(id);
                    var n = e.Attribute("Name")?.Value;
                    if (n != null) names.Add(n);
                }
            }
            _classPaths = classPaths.Where(p => p != "").Distinct().ToList();
            _ids = ids.Distinct().ToList();
            _names = names.Distinct().ToList();
            _aliases = _doc.XDocument.Root!.Elements().Where(x => x.Name.LocalName == "ExternalReference")
                .Select(x => x.Attribute("Alias")?.Value ?? "").ToList();
            _refs = _doc.XDocument.Root!.Descendants()
                .SelectMany(x => x.Attributes())
                .Where(a => a.Name.LocalName.StartsWith("Ref") || a.Name.LocalName == "MasterID")
                .Select(a => a.Value).Distinct().ToList();
        }

        static T? Pick<T>(List<T> l, int i, int salt) where T : class =>
            l.Count == 0 ? null : l[(int)(((long)i * 7919 + salt * 104729) % l.Count)];

        /// <summary>Reference strings of the object: its reference attributes, own path and ID.</summary>
        List<List<(string Name, string Value)>> _init = new();

        string? Init(int i, string name) => _init[i].Where(a => a.Name == name).Select(a => a.Value).FirstOrDefault();

        List<string> OwnRefs(int i) =>
            _init[i].Where(a => a.Name.StartsWith("Ref") || a.Name == "MasterID").Select(a => a.Value).ToList();

        List<object?> StringPool(int i, string pname, string method)
        {
            var e = _snap[i];
            var w = e.CreateCAEXWrapper();
            var own = OwnRefs(i);
            var path = w is CAEXObject co ? Try2(() => co.CAEXPath()) : null;
            var l = new List<object?>();
            var pn = pname.ToLowerInvariant();
            if (method is "CAEXChild" or "CAEXChildren" || pn == "tagname")
            {
                var child = e.Elements().FirstOrDefault()?.Name.LocalName;
                l.AddRange(new object?[] { child ?? "Attribute", "InternalElement", "Nope" });
            }
            else if (pn is "elementname" && method.StartsWith("Elements") || pn == "elementname" && method.StartsWith("All"))
                l.AddRange(new object?[] { "", "InternalElement", "ExternalInterface", "SystemUnitClass" });
            else if (pn.Contains("alias") && !pn.Contains("path"))
            {
                l.AddRange(_aliases.Take(2));
                l.Add("NoAlias");
                l.Add("");
            }
            else if (pn is "id" or "referenceguid" or "idstring" or "stringguid" or "amlid")
            {
                var id = Init(i, "ID");
                if (id != null) l.Add(id);
                l.Add(Pick(_ids, i, 1));
                l.Add(own.FirstOrDefault());
                l.Add("00000000-0000-0000-0000-000000000000");
                l.Add("");
            }
            else if (pn.Contains("name") && !pn.Contains("path"))
            {
                var child = e.Elements().Select(x => x.Attribute("Name")?.Value).FirstOrDefault(x => x != null);
                l.Add(child ?? e.Attribute("Name")?.Value);
                l.Add(Pick(_names, i, 2));
                l.Add("Nope");
                if (method is "GetAttribute" or "GetCAEXAttribute" or "GetAttributeValue")
                {
                    var attr = e.Elements().FirstOrDefault(x => x.Name.LocalName == "Attribute");
                    var sub = attr?.Elements().FirstOrDefault(x => x.Name.LocalName == "Attribute");
                    if (attr != null && sub != null) l.Add(attr.Attribute("Name")?.Value + "/" + sub.Attribute("Name")?.Value);
                }
            }
            else if (pn.Contains("version"))
            {
                l.Add("1.0.0");
                l.Add(null);
            }
            else
            {
                // paths and references
                l.AddRange(own);
                l.Add(path);
                l.Add(Pick(_classPaths, i, 3));
                l.Add(Pick(_refs, i, 4));
                l.Add("NoLib/NoClass");
                l.Add("");
            }
            return l.Distinct().Take(Expensive.Contains(method) ? 2 : 5).ToList();
        }

        List<object?> Pool(int i, ParameterInfo p, int pos, string method, bool isSelf)
        {
            var t = p.ParameterType;
            var pn = p.Name ?? "";
            var w = _snap[i].CreateCAEXWrapper();
            if (t == typeof(string)) return StringPool(i, pn, method);
            if (t == typeof(bool)) return new List<object?> { true, false };
            if (t == typeof(int)) return new List<object?> { 0, 1, -1 };
            if (t == typeof(CAEXDocument)) return new List<object?> { _doc };
            if (t == typeof(CAEXDocument.CAEXSchema)) return new List<object?> { _doc.Schema, _doc.Schema == CAEXDocument.CAEXSchema.CAEX3_0 ? CAEXDocument.CAEXSchema.CAEX2_15 : CAEXDocument.CAEXSchema.CAEX3_0 };
            if (t == typeof(CAEXPathBuilder.IDRefEnum)) return Enum.GetValues<CAEXPathBuilder.IDRefEnum>().Cast<object?>().ToList();
            if (t == typeof(XName)) return new List<object?> { (XName)"Name", (XName)"ID", (XName)"RefBaseClassPath" };
            if (t == typeof(XNode)) return new List<object?> { _snap[i] };
            if (t == typeof(XElement))
                return new List<object?> { _snap[i], _snap[i].Elements().FirstOrDefault(x => x.Name.LocalName == "ExternalInterface") ?? _snap[(i + 1) % _snap.Count] };
            if (t == typeof(Type))
            {
                if (method == "OverriddenElement") return new List<object?> { typeof(AttributeType), typeof(ExternalInterfaceType), typeof(InternalElementType) };
                if (method == "TagName") return new List<object?> { w!.GetType(), typeof(InternalElementType), typeof(CAEXObject) };
                return new List<object?> { null, w!.GetType(), typeof(SystemUnitFamilyType) };
            }
            if (t == typeof(string[]))
            {
                var names = w is CAEXObject ? AncestorNames(_snap[i]) : new List<string>();
                return new List<object?> { names.ToArray(), new[] { "A", "B" } };
            }
            if (t == typeof(IEnumerable<CAEXObject>))
                return new List<object?> { AncestorObjects(_snap[i]).Select(x => (CAEXObject)x.CreateCAEXWrapper()!).ToList() };
            if (t == typeof(IEnumerable<XElement>))
                return new List<object?> { AncestorObjects(_snap[i]) };
            if (t == typeof(ICAEXWrapper) && method == "CAEXSequence")
            {
                var l = _snap[i].Elements().Where(x => _snapIndex.ContainsKey(x)).Take(3).Select(x => (object?)x.CreateCAEXWrapper()).ToList();
                l.Add(w);
                return l;
            }
            if (typeof(ICAEXWrapper).IsAssignableFrom(t) || t.IsInterface)
            {
                var l = new List<object?>();
                if (isSelf) { l.Add(w); return l; }
                // related objects of the self object
                foreach (var rel in Related(w))
                    if (rel != null && t.IsInstanceOfType(rel) && rel.Node?.Document == _doc.XDocument) l.Add(rel);
                var cands = Candidates(t);
                if (cands.Count > 0)
                {
                    l.Add(cands[(int)(((long)i * 7919 + pos) % cands.Count)].CreateCAEXWrapper());
                    l.Add(cands[(int)(((long)i * 31 + 17 + pos) % cands.Count)].CreateCAEXWrapper());
                }
                l.Add(null);
                return l.Distinct(new WrapperEq()).Take(4).ToList();
            }
            return new List<object?> { null };
        }

        readonly Dictionary<Type, List<XElement>> _cands = new();
        readonly HashSet<string> _seen = new();

        static readonly HashSet<string> Expensive = new()
        {
            "RelatedInternalElementsWithRoleReference", "IsRelated", "RelatedInstances", "RelatedExternalInterfaces",
            "InternalLinksToInterface", "InternalLinksToElement", "LowestCommonParent",
        };

        readonly Dictionary<Type, Dictionary<int, int>> _ordinals = new();

        /// <summary>True for about <paramref name="max"/> evenly spread objects of the type.</summary>
        bool Sampled(Type t, int i, int max)
        {
            if (!_ordinals.TryGetValue(t, out var d))
            {
                d = new Dictionary<int, int>();
                foreach (var e in _snap)
                    if (e.CreateCAEXWrapper()?.GetType() == t) d[_snapIndex[e]] = d.Count;
                _ordinals[t] = d;
            }
            return d.TryGetValue(i, out var k) && k % Math.Max(1, (d.Count + max - 1) / max) == 0;
        }

        bool IsScope(int i)
        {
            var tag = _snap[i].Name.LocalName;
            if (tag is "CAEXFile" or "InstanceHierarchy" || tag.EndsWith("Lib")) return true;
            return i % Math.Max(1, _snap.Count / 60) == 0;
        }

        List<XElement> Candidates(Type t)
        {
            if (_cands.TryGetValue(t, out var l)) return l;
            l = _snap.Where(e => t.IsInstanceOfType(e.CreateCAEXWrapper())).ToList();
            _cands[t] = l;
            return l;
        }

        static IEnumerable<CAEXWrapper?> Related(CAEXWrapper? w)
        {
            var l = new List<Func<CAEXWrapper?>>();
            switch (w)
            {
                case InternalElementType ie:
                    l.Add(() => ie.SystemUnitClass);
                    l.Add(() => ie.RoleRequirements.FirstOrDefault()?.RoleClass);
                    l.Add(() => ie.SupportedRoleClass.FirstOrDefault()?.RoleClass);
                    l.Add(() => ie.RoleRequirements.FirstOrDefault());
                    l.Add(() => ie.ExternalInterface.FirstOrDefault()?.InterfaceClass);
                    l.Add(() => ie.Attribute.FirstOrDefault());
                    l.Add(() => ie.ExternalInterface.FirstOrDefault());
                    l.Add(() => ie.CAEXParent);
                    break;
                case SystemUnitFamilyType s:
                    l.Add(() => s.BaseClass);
                    l.Add(() => s.SupportedRoleClass.FirstOrDefault()?.RoleClass);
                    l.Add(() => s.ExternalInterface.FirstOrDefault()?.InterfaceClass);
                    l.Add(() => s.Attribute.FirstOrDefault());
                    l.Add(() => s.CAEXParent);
                    break;
                case RoleFamilyType r:
                    l.Add(() => r.BaseClass);
                    l.Add(() => r.Attribute.FirstOrDefault());
                    l.Add(() => r.CAEXParent);
                    break;
                case InterfaceFamilyType ic:
                    l.Add(() => ic.BaseClass);
                    l.Add(() => ic.CAEXParent);
                    break;
                case AttributeFamilyType at:
                    l.Add(() => at.BaseClass);
                    l.Add(() => at.CAEXParent);
                    break;
                case ExternalInterfaceType ei:
                    l.Add(() => ei.InterfaceClass);
                    l.Add(() => ei.CAEXParent);
                    break;
                case RoleRequirementsType rr:
                    l.Add(() => rr.RoleClass);
                    l.Add(() => rr.Attribute.FirstOrDefault());
                    l.Add(() => rr.ExternalInterface.FirstOrDefault());
                    break;
                case SupportedRoleClassType src:
                    l.Add(() => src.RoleClass);
                    break;
                case AttributeType a:
                    l.Add(() => a.CAEXParent);
                    l.Add(() => a.Attribute.FirstOrDefault());
                    break;
                default:
                    l.Add(() => w?.CAEXParent);
                    break;
            }
            foreach (var f in l)
            {
                CAEXWrapper? r;
                try { r = f(); } catch { r = null; }
                yield return r;
            }
        }

        List<XElement> AncestorObjects(XElement e)
        {
            var l = e.AncestorsAndSelf().Where(x => x.CreateCAEXWrapper() is CAEXObject && x.Parent != null).Reverse().ToList();
            return l;
        }

        List<string> AncestorNames(XElement e) =>
            AncestorObjects(e).Select(x => x.Attribute("Name")?.Value ?? "").ToList();

        sealed class WrapperEq : IEqualityComparer<object?>
        {
            public new bool Equals(object? a, object? b) =>
                a is CAEXWrapper wa && b is CAEXWrapper wb ? wa.Node == wb.Node : ReferenceEquals(a, b);
            public int GetHashCode(object? o) => o is CAEXWrapper w ? w.Node?.GetHashCode() ?? 0 : o?.GetHashCode() ?? 0;
        }

        // ---------------------------------------------------------------- per object
        void ObjectReads(int i)
        {
            var w = _snap[i].CreateCAEXWrapper()!;
            // sequences and methods: on all objects of small documents, on an evenly spread sample per type in large ones
            var full = _snap.Count <= 600 || Sampled(w.GetType(), i, 150) || IsScope(i);
            // properties
            foreach (var p in Props(w.GetType()))
            {
                // properties that scan the whole document: on the sampled objects only
                if (!full && p.Name is "IsMaster" or "CAEXSequenceOfCAEXObject") continue;
                object? v = null;
                JsonNode? r;
                r = TryNode(() => { v = p.GetValue(w); return Enc(v); }, "p " + p.Name);
                if (r is JsonValue hv && hv.TryGetValue<string>(out var hs) && hs == "!hang") v = null;
                Emit(i, "p", p.Name, new JsonArray(), r);
                if (full && v != null && IsSequence(v)) SequenceProbes(i, p.Name, v);
            }
            // indexers of the object itself (libraries by name)
            if (w is ICAEXLibrary || IsLibrary(w)) LibraryIndexers(i, w);
            // methods: on all objects of small documents, on an evenly spread sample per type in large ones
            if (!full) return;
            foreach (var s in ParsedSpecs())
            {
                if (s.Kind == 'D' || s.Kind == 'R') continue;
                RunSpec(i, w, s);
            }
            // document level references for classes and objects with IDs (sampled in large documents)
            if (w is CAEXObject co)
            {
                var step = Math.Max(1, _snap.Count / 400);
                if (i % step == 0)
                    foreach (var s in ParsedSpecs().Where(s => s.Kind == 'R'))
                        RunSpec(i, w, s);
            }
        }

        static bool IsLibrary(CAEXWrapper w) => w.GetType().BaseType is { IsGenericType: true } b && b.GetGenericTypeDefinition() == typeof(CAEXLibrary<>);

        static readonly Dictionary<Type, List<PropertyInfo>> PropCache = new();

        static List<PropertyInfo> Props(Type t)
        {
            if (PropCache.TryGetValue(t, out var l)) return l;
            l = t.GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .Where(p => p.GetIndexParameters().Length == 0 && p.CanRead && p.GetMethod!.IsPublic && !SkipProps.Contains(p.Name))
                .GroupBy(p => p.Name).Select(g => g.First())
                .OrderBy(p => p.Name, StringComparer.Ordinal).ToList();
            PropCache[t] = l;
            return l;
        }

        static bool IsSequence(object v)
        {
            for (var t = v.GetType(); t != null; t = t.BaseType)
                if (t.IsGenericType && (t.GetGenericTypeDefinition() == typeof(NamedElementSequence<>) || t.GetGenericTypeDefinition() == typeof(ValueSequence<>)))
                    return true;
            return false;
        }

        void SequenceProbes(int i, string prop, object seq)
        {
            var target = new JsonArray(i, prop);
            object? Get() => _snap[i].CreateCAEXWrapper() is { } w ? w.GetType().GetProperty(prop)!.GetValue(w) : null;
            // properties of the sequence
            foreach (var p in Props(seq.GetType()))
            {
                if (p.Name is "Elements" or "Values" or "ElementAndValues") continue;
                var r = TryNode(() => Enc(p.GetValue(Get())), "sp " + p.Name);
                Emit(target.DeepClone(), "p", p.Name, new JsonArray(), r);
            }
            var count = 0;
            try { count = (int)seq.GetType().GetProperty("Count")!.GetValue(seq)!; } catch { }
            if (count == 0 && i % 10 != 0) return;
            // int indexer and At
            foreach (var k in new[] { 0, count - 1, count, -1 }.Distinct())
            {
                Emit(target.DeepClone(), "i", "Item", new JsonArray(k), TryNode(() => Enc(Indexer(Get()!, typeof(int), k))));
                var at = Get()!.GetType().GetMethod("At", new[] { typeof(int) });
                if (at != null) Emit(target.DeepClone(), "m", "At", new JsonArray(k), TryNode(() => Enc(Invoke(at, Get(), new object?[] { k }))));
            }
            // IndexOf of the first and of an unrelated element
            var indexOf = Get()!.GetType().GetMethods().FirstOrDefault(m => m.Name == "IndexOf" && m.GetParameters().Length == 1 && !m.GetParameters()[0].ParameterType.IsInterface);
            if (indexOf != null && seq is ICAEXSequence cs)
            {
                var first = cs.First;
                if (first?.Node != null && _snapIndex.TryGetValue(first.Node, out var fi))
                    Emit(target.DeepClone(), "m", "IndexOf", new JsonArray(new JsonObject { ["o"] = fi }), TryNode(() => Enc(Invoke(indexOf, Get(), new object?[] { _snap[fi].CreateCAEXWrapper() }))));
                var last = cs.Last;
                if (last?.Node != null && _snapIndex.TryGetValue(last.Node, out var li))
                    Emit(target.DeepClone(), "m", "IndexOf", new JsonArray(new JsonObject { ["o"] = li }), TryNode(() => Enc(Invoke(indexOf, Get(), new object?[] { _snap[li].CreateCAEXWrapper() }))));
            }
            if (seq is ICAEXSequence)
            {
                // tuple indexer
                var firstEl = ((IEnumerable)seq).Cast<object>().FirstOrDefault() as CAEXWrapper;
                var n = firstEl?.Node.Attribute("Name")?.Value;
                foreach (var (an, av) in new[] { ("Name", n), ("ID", firstEl != null && _snapIndex.TryGetValue(firstEl.Node, out var fx) ? Init(fx, "ID") : null), ("Name", "Nope") })
                {
                    if (av == null) continue;
                    Emit(target.DeepClone(), "i", "Item", new JsonArray(new JsonObject { ["tup"] = new JsonArray(an, av) }),
                        TryNode(() => Enc(Indexer(Get()!, typeof(ValueTuple<string, string>), (an, av)))));
                }
            }
            // name indexers of CAEX object sequences
            if (HasIndexer(seq.GetType(), typeof(string)))
            {
                var items = ((IEnumerable)seq).Cast<object>().OfType<CAEXObject>().Take(2).ToList();
                var names = new List<string?>();
                foreach (var it in items) names.Add(it.Name);
                names.Add("Nope");
                names.Add("");
                // a path of names below the first element
                var first = items.FirstOrDefault();
                var sub = first?.Node.Elements().FirstOrDefault(x => x.Name == first.Node.Name && x.Attribute("Name") != null)?.Attribute("Name")?.Value;
                if (first != null && sub != null)
                {
                    names.Add(first.Name + "/" + sub);
                    names.Add(first.Name + "/" + sub + "/Nope");
                }
                foreach (var nm in names.Distinct())
                    Emit(target.DeepClone(), "i", "Item", new JsonArray(new JsonObject { ["s"] = nm }), TryNode(() => Enc(Indexer(Get()!, typeof(string), nm))));
                if (HasIndexer(seq.GetType(), typeof(string[])) && first != null)
                {
                    var arrs = new List<string[]> { new[] { first.Name }, new[] { first.Name, "Nope" }, Array.Empty<string>() };
                    if (sub != null) arrs.Add(new[] { first.Name, sub });
                    foreach (var arr in arrs)
                        Emit(target.DeepClone(), "i", "Item", new JsonArray(new JsonObject { ["sa"] = new JsonArray(arr.Select(x => (JsonNode?)x).ToArray()) }),
                            TryNode(() => Enc(Indexer(Get()!, typeof(string[]), arr))));
                }
            }
        }

        void LibraryIndexers(int i, CAEXWrapper w)
        {
            if (!HasIndexer(w.GetType(), typeof(string))) return;
            var items = ((IEnumerable)w).Cast<object>().OfType<CAEXObject>().Take(2).ToList();
            var names = items.Select(x => x.Name).ToList();
            names.Add("Nope");
            var first = items.FirstOrDefault();
            var sub = first?.Node.Elements().FirstOrDefault(x => x.Name == first.Node.Name && x.Attribute("Name") != null)?.Attribute("Name")?.Value;
            if (sub != null) names.Add(first!.Name + "/" + sub);
            foreach (var nm in names.Distinct())
                Emit(i, "i", "Item", new JsonArray(new JsonObject { ["s"] = nm }), TryNode(() => Enc(Indexer(_snap[i].CreateCAEXWrapper()!, typeof(string), nm))));
            if (HasIndexer(w.GetType(), typeof(string[])) && first != null)
            {
                var arrs = new List<string[]> { new[] { first.Name }, new[] { "Nope" } };
                if (sub != null) arrs.Add(new[] { first.Name, sub });
                foreach (var arr in arrs)
                    Emit(i, "i", "Item", new JsonArray(new JsonObject { ["sa"] = new JsonArray(arr.Select(x => (JsonNode?)x).ToArray()) }),
                        TryNode(() => Enc(Indexer(_snap[i].CreateCAEXWrapper()!, typeof(string[]), arr))));
            }
        }

        static bool HasIndexer(Type t, Type arg) =>
            t.GetProperties().Any(p => p.Name == "Item" && p.GetIndexParameters() is { Length: 1 } ps && ps[0].ParameterType == arg);

        static object? Indexer(object target, Type arg, object? value)
        {
            // the most derived indexer with that parameter type
            for (var t = target.GetType(); t != null; t = t.BaseType)
            {
                var p = t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
                    .FirstOrDefault(x => x.Name == "Item" && x.GetIndexParameters() is { Length: 1 } ps && ps[0].ParameterType == arg);
                if (p != null) return p.GetValue(target, new[] { value });
            }
            throw new MissingMemberException();
        }

        void RunSpec(int i, CAEXWrapper w, Spec s)
        {
            var m = s.Method;
            var ps = m.GetParameters();
            // generic type arguments
            var gens = new List<Type?> { null };
            if (s.Generic == "<T>") gens = GenericArgs.Where((t, k) => k % 5 == i % 5 || t.IsInstanceOfType(w) && t == w.GetType()).Take(2).Cast<Type?>().ToList();
            foreach (var g in gens)
            {
                MethodInfo mi = m;
                if (s.Generic == "<T>")
                {
                    try { mi = m.MakeGenericMethod(g!); } catch { continue; }
                }
                else if (s.Generic == "<~>")
                {
                    var itf = w.GetType().GetInterfaces().FirstOrDefault(x => x.IsGenericType && x.GetGenericTypeDefinition() == typeof(IClassWithBaseClassReference<>));
                    if (itf == null) return;
                    try { mi = m.MakeGenericMethod(itf.GetGenericArguments()[0]); } catch { return; }
                }
                var mps = mi.GetParameters();
                // which parameter takes the object
                var selfIdx = -1;
                if (s.Kind == 'M')
                {
                    if (!s.Decl.IsInstanceOfType(w) && !(s.Decl.IsGenericTypeDefinition && IsGenericInstance(w.GetType(), s.Decl))) return;
                    if (s.Decl.IsGenericTypeDefinition)
                    {
                        var names = m.GetParameters().Select(p => p.ParameterType.Name).ToList();
                        var rm = w.GetType().GetMethods().FirstOrDefault(x => x.Name == m.Name && x.GetParameters().Select(p => p.ParameterType.Name).SequenceEqual(names));
                        if (rm == null) return;
                        mi = rm;
                        mps = mi.GetParameters();
                    }
                }
                else if (s.Kind == 'X' && mps.Length > 0 && mps[0].ParameterType == typeof(CAEXDocument))
                {
                    if (w is not CAEXObject) return;
                }
                else if (s.Kind == 'X')
                {
                    if (mps.Length == 0 || !mps[0].ParameterType.IsInstanceOfType(w)) return;
                    selfIdx = 0;
                }
                else if (s.Kind == 'Q')
                {
                    selfIdx = Array.FindIndex(mps, p => p.ParameterType != typeof(CAEXDocument) && typeof(ICAEXWrapper).IsAssignableFrom(p.ParameterType));
                    if (selfIdx < 0 && w is not CAEXObject) return;
                    if (selfIdx >= 0 && !mps[selfIdx].ParameterType.IsInstanceOfType(w)) return;
                    // queries over the whole subtree: on libraries, the file and a sample of objects
                    if (selfIdx >= 0 && (s.Name.StartsWith("All") || s.Name.EndsWith("Relations")) && !IsScope(i)) return;
                }
                else if (s.Kind == 'S')
                {
                    // static helpers: only on objects with references or on CAEX objects for object parameters
                    var objIdx = Array.FindIndex(mps, p => typeof(ICAEXWrapper).IsAssignableFrom(p.ParameterType));
                    if (objIdx >= 0)
                    {
                        if (!mps[objIdx].ParameterType.IsInstanceOfType(w)) return;
                        selfIdx = objIdx;
                    }
                    else if (mps.Any(p => p.ParameterType == typeof(XElement) || p.ParameterType == typeof(IEnumerable<XElement>) || p.ParameterType == typeof(IEnumerable<CAEXObject>)) || mps.Length > 0 && mps[0].ParameterType == typeof(string[]))
                    {
                        if (w is not CAEXObject) return;
                        if (mps.Any(p => p.ParameterType == typeof(XElement)) && _snap[i].Name.LocalName != "ExternalInterface" && _snap[i].Name.LocalName != "InternalElement") return;
                    }
                    else if (mps.Any(p => p.ParameterType == typeof(Type)))
                    {
                        if (i % 7 != 0) return;
                    }
                    else if (OwnRefs(i).Count == 0 && !(w is CAEXObject && i % 3 == 0)) return;
                }
                else if (s.Kind == 'R')
                {
                    selfIdx = -1;
                }
                // queries that scan all links of the document: on a sample of the objects
                if (Expensive.Contains(s.Name) && !Sampled(w.GetType(), i, 8)) return;
                // pools
                var pools = new List<List<object?>>();
                var outs = new List<int>();
                for (var k = 0; k < mps.Length; k++)
                {
                    var pt = mps[k].ParameterType;
                    if (pt.IsByRef && mps[k].IsOut) { outs.Add(k); pools.Add(new List<object?> { null }); continue; }
                    if (k == selfIdx) { pools.Add(new List<object?> { _snap[i].CreateCAEXWrapper() }); continue; }
                    var pool = Pool(i, mps[k], k, s.Name, false);
                    if (s.NoNull && pt == typeof(string)) pool = pool.Where(x => x != null).ToList();
                    if (s.Kind == 'R' && pt == typeof(string))
                    {
                        pool = s.Name switch
                        {
                            "ElementsWithIDReference" => new List<object?> { Init(i, "ID") ?? "" },
                            "ElementsWithAliasReference" => _aliases.Take(1).Cast<object?>().Append("NoAlias").ToList(),
                            _ => new List<object?> { w is CAEXObject co ? Try2(() => co.CAEXPath()) : null },
                        };
                    }
                    if (pool.Count == 0) pool.Add(null);
                    pools.Add(pool);
                }
                foreach (var combo in Combos(pools, 4))
                {
                    var args = combo.ToArray();
                    var encArgs = new JsonArray();
                    for (var k = 0; k < args.Length; k++)
                        encArgs.Add(outs.Contains(k) ? new JsonObject { ["out"] = Camel(mps[k].Name!) } : EncArg(args[k], mps[k].ParameterType));
                    if (g != null) encArgs.Add(new JsonObject { ["g"] = TypeName(g) });
                    // calls that do not involve the object: once per document and argument list
                    if (selfIdx < 0 && s.Kind != 'M' && !_seen.Add(s.Kind + "|" + s.Name + "|" + mi + "|" + encArgs.ToJsonString())) continue;
                    JsonNode? r = TryNode(() =>
                    {
                        object? target = s.Kind == 'M' ? _snap[i].CreateCAEXWrapper() : s.Kind == 'Q' && !mi.IsStatic ? (s.Decl == typeof(IQuery) || s.Decl.Name == "IStatistic" ? ServiceLocator.QueryService : null) : null;
                        var ret = Invoke(mi, target, args);
                        if (outs.Count > 0)
                        {
                            var o = new JsonObject { ["result"] = mi.ReturnType == typeof(void) ? null : Enc(ret) };
                            foreach (var k in outs) o[Camel(mps[k].Name!)] = Enc(args[k]);
                            return o;
                        }
                        return Enc(ret);
                    }, s.Kind + " " + s.Name);
                    var kind = s.Kind switch
                    {
                        'M' => "m",
                        'Q' when s.Decl == typeof(IQuery) || s.Decl.Name == "IStatistic" => "q",
                        _ => "s:" + StaticName(s.Decl),
                    };
                    Emit(s.Kind == 'M' ? i : kind == "q" ? "qs" : null, kind, s.Name, encArgs, r);
                }
            }
        }

        static bool IsGenericInstance(Type t, Type def)
        {
            for (var x = t; x != null; x = x.BaseType)
                if (x.IsGenericType && x.GetGenericTypeDefinition() == def) return true;
            return false;
        }

        static string StaticName(Type t) => t.IsNested ? t.DeclaringType!.Name + "_" + t.Name : t.Name;

        static IEnumerable<List<object?>> Combos(List<List<object?>> pools, int max)
        {
            if (pools.Count == 0) { yield return new List<object?>(); yield break; }
            // walk the product in a diagonal order so each value of each pool appears early
            var total = pools.Aggregate(1L, (a, p) => a * p.Count);
            var n = (int)Math.Min(total, max);
            var seen = new HashSet<string>();
            var emitted = 0;
            for (long k = 0; emitted < n && k < total * 2; k++)
            {
                var combo = new List<object?>();
                var key = new StringBuilder();
                for (var j = 0; j < pools.Count; j++)
                {
                    var idx = (int)((k + j * (k / pools[j].Count)) % pools[j].Count);
                    combo.Add(pools[j][idx]);
                    key.Append(idx).Append(',');
                }
                if (!seen.Add(key.ToString())) continue;
                emitted++;
                yield return combo;
            }
        }

        // ---------------------------------------------------------------- document level
        void DocumentLevel()
        {
            foreach (var p in Props(typeof(CAEXDocument)))
            {
                if (p.Name is "Commands") continue;
                Emit("doc", "p", p.Name, new JsonArray(), TryNode(() => Enc(p.GetValue(_doc))));
            }
            // table state of the query service
            var qs = ServiceLocator.QueryService as ILookUpTable;
            if (qs != null)
            {
                Emit("qs", "q", "IDTableIsLoaded", new JsonArray(new JsonObject { ["doc"] = 1 }), TryNode(() => Enc(qs.IDTableIsLoaded(_doc))));
                Emit("qs", "q", "PathTableIsLoaded", new JsonArray(new JsonObject { ["doc"] = 1 }), TryNode(() => Enc(qs.PathTableIsLoaded(_doc))));
            }
            foreach (var s in ParsedSpecs().Where(s => s.Kind == 'D'))
            {
                var mps = s.Method.GetParameters();
                var gens = s.Generic == "<T>" ? new[] { typeof(SystemUnitFamilyType), typeof(RoleFamilyType), typeof(InterfaceFamilyType), typeof(AttributeFamilyType) } : new Type?[] { null };
                foreach (var g in gens)
                {
                    var mi = g == null ? s.Method : s.Method.MakeGenericMethod(g);
                    var pools = new List<List<object?>>();
                    foreach (var p in mps)
                    {
                        if (p.ParameterType == typeof(CAEXDocument)) pools.Add(new List<object?> { _doc });
                        else if (p.ParameterType == typeof(CAEXFileType)) pools.Add(new List<object?> { _doc.CAEXFile });
                        else if (p.ParameterType == typeof(string))
                        {
                            var pn = p.Name!.ToLowerInvariant();
                            if (s.Name == "XName") pools.Add(new List<object?> { "InternalElement", "Foo", "" });
                            else if (pn.Contains("alias")) pools.Add(_aliases.Take(2).Cast<object?>().Append("Nope").ToList());
                            else if (pn == "elementname") pools.Add(new List<object?> { "", "InternalElement", "SystemUnitClass" });
                            else
                            {
                                var l = new List<object?>();
                                for (var k = 0; k < 3; k++) l.Add(Pick(_classPaths, k, 11 + k));
                                l.Add(Pick(_refs, 0, 5));
                                l.Add("NoLib/NoClass");
                                pools.Add(l.Distinct().ToList());
                            }
                        }
                        else if (p.ParameterType == typeof(CAEXDocument.CAEXSchema)) pools.Add(new List<object?> { CAEXDocument.CAEXSchema.CAEX2_15, CAEXDocument.CAEXSchema.CAEX3_0, CAEXDocument.CAEXSchema.Unknown });
                        else if (p.ParameterType == typeof(XElement) || p.ParameterType == typeof(XNode)) pools.Add(new List<object?> { _doc.XDocument.Root, _snap.Count > 1 ? _snap[1] : null });
                        else pools.Add(new List<object?> { null });
                    }
                    foreach (var combo in Combos(pools, s.Name.StartsWith("ClassIsDerivedFrom") ? 12 : 6))
                    {
                        var args = combo.ToArray();
                        var enc = new JsonArray();
                        for (var k = 0; k < args.Length; k++) enc.Add(EncArg(args[k], mps[k].ParameterType));
                        if (g != null) enc.Add(new JsonObject { ["g"] = TypeName(g) });
                        var isQ = s.Decl == typeof(IQuery);
                        var inst = !isQ && !mi.IsStatic;
                        Emit(isQ ? "qs" : inst ? "doc" : null, isQ ? "q" : inst ? "m" : "s:" + StaticName(s.Decl), s.Name, enc,
                            TryNode(() => Enc(Invoke(mi, isQ ? ServiceLocator.QueryService : inst ? _doc : null, args)), "D " + s.Name));
                    }
                }
            }
        }

        // ---------------------------------------------------------------- helpers
        void Checkpoint()
        {
            if (!_dirty) return;
            _dirty = false;
            Emit(null, "#", "save", new JsonArray(), Hash(_canon.Apply(Save(_doc, true))));
        }

        public static readonly Dictionary<string, long> Profile = new();
        static readonly bool Trace = Environment.GetEnvironmentVariable("READS_TRACE") != null;
        readonly System.Diagnostics.Stopwatch _sw = System.Diagnostics.Stopwatch.StartNew();

        void Emit(JsonNode? target, string kind, string name, JsonArray args, JsonNode? result)
        {
            var key = kind + " " + name;
            if (Trace) Console.Error.WriteLine($"{target?.ToJsonString()} {key} {args.ToJsonString()}");
            if (_changed)
            {
                _changed = false;
                var mk = (target is JsonValue tv && tv.TryGetValue<int>(out var ti) ? _snap[ti].Name.LocalName + " " : "") + key;
                Mutators[mk] = Mutators.GetValueOrDefault(mk) + 1;
            }
            Profile[key] = Profile.GetValueOrDefault(key) + _sw.ElapsedTicks;
            if (_sw.ElapsedMilliseconds > 2000 && Environment.GetEnvironmentVariable("READS_PROFILE") != null)
                Console.WriteLine($"   slow {_sw.ElapsedMilliseconds} ms {key} {target?.ToJsonString()} {args.ToJsonString()}");
            _sw.Restart();
            var line = new JsonArray(target, kind, name, args, _canon.Walk(result));
            _out.Add(line.ToJsonString(JsonOpts));
            CountingIDService.Lines = _out.Count;
        }

        void Emit(int target, string kind, string name, JsonArray args, JsonNode? result) =>
            Emit((JsonNode)target, kind, name, args, result);

        void Emit(string? target, string kind, string name, JsonArray args, JsonNode? result) =>
            Emit(target == null ? null : (JsonNode)target, kind, name, args, result);

        JsonNode? EncArg(object? a, Type t)
        {
            switch (a)
            {
                case null: return null;
                case string s: return new JsonObject { ["s"] = s };
                case bool b: return b;
                case int n: return n;
                case CAEXDocument: return new JsonObject { ["doc"] = 1 };
                case CAEXWrapper w: return _snapIndex.TryGetValue(w.Node, out var k) ? new JsonObject { ["o"] = k } : throw new Exception("arg not in snapshot");
                case XElement x: return _snapIndex.TryGetValue(x, out var xi) ? new JsonObject { ["x"] = xi } : x == _doc.XDocument.Root ? new JsonObject { ["x"] = 0 } : throw new Exception("xarg");
                case XName xn: return new JsonObject { ["xn"] = xn.ToString() };
                case Type ty: return new JsonObject { ["t"] = TypeName(ty) };
                case Enum e: return new JsonObject { ["e"] = StaticName(e.GetType()), ["v"] = e.ToString() };
                case string[] sa: return new JsonObject { ["sa"] = new JsonArray(sa.Select(x => (JsonNode?)x).ToArray()) };
                case List<CAEXObject> ol: return new JsonObject { ["oa"] = new JsonArray(ol.Select(x => (JsonNode?)_snapIndex[x.Node]).ToArray()) };
                case List<XElement> xl: return new JsonObject { ["xa"] = new JsonArray(xl.Select(x => (JsonNode?)_snapIndex[x]).ToArray()) };
            }
            throw new Exception("cannot encode arg " + a.GetType());
        }

        string Pos(XElement e)
        {
            if (e.Document != _doc.XDocument)
            {
                var w = e.CreateCAEXWrapper();
                var desc = w is CAEXObject co ? Try2(() => co.CAEXPath()) : e.Attribute("Name")?.Value;
                return "?" + (e.Document == null ? "detached" : "other") + ":" + e.Name.LocalName + ":" + desc;
            }
            var parts = new List<int>();
            for (var x = e; x.Parent != null; x = x.Parent) parts.Add(x.ElementsBeforeSelf().Count());
            parts.Reverse();
            return "/" + string.Join("/", parts);
        }

        JsonNode? Enc(object? v, int depth = 0)
        {
            switch (v)
            {
                case null: return null;
                case string s: return s;
                case bool b: return b;
                case char c: return "c:" + c;
                case int or short or byte or long or uint or ushort or sbyte or ulong: return JsonValue.Create(Convert.ToInt64(v));
                case double d: return "d:" + d.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
                case float f: return "d:" + ((double)f).ToString("R", System.Globalization.CultureInfo.InvariantCulture);
                case decimal m: return "m:" + m.ToString(System.Globalization.CultureInfo.InvariantCulture);
                case Enum e: return "e:" + StaticName(e.GetType()) + "." + e;
                case DateTime dt: return "dt:" + dt.ToString("o");
                case Guid g: return g.ToString();
                case Type t: return "t:" + TypeName(t);
                case XName xn: return "xn:" + xn;
                case XElement x: return "x:" + Pos(x);
                case XAttribute xa: return "xa:" + xa.Name + "@" + (xa.Parent == null ? "?" : Pos(xa.Parent));
                case XDocument xd: return "xdoc:" + (xd == _doc.XDocument ? "self" : "other");
                case CAEXDocument cd: return "doc:" + (cd == _doc ? "self" : "other");
                case CAEXWrapper w when !IsSequence(w): return "w:" + TypeName(w.GetType()) + "@" + (w.Node == null ? "null" : Pos(w.Node));
                case ICAEXReference r:
                    var re = r is CAEXReference cr ? cr.Element : r.CaexObject?.Node;
                    return "ref:" + r.ReferenceAttributeName + "@" + (re == null ? "null" : Pos(re)) + "=" + r.ReferenceAttributeValue;
                case Aml.Engine.Schema.AMLSchemaManager sm: return "o:" + TypeName(sm.GetType());
            }
            var type = v.GetType();
            if (type.Name == "SemanticVersion") return "sv:" + v;
            if (type.IsGenericType && type.GetGenericTypeDefinition() == typeof(KeyValuePair<,>))
                return new JsonArray(Enc(type.GetProperty("Key")!.GetValue(v), depth + 1), Enc(type.GetProperty("Value")!.GetValue(v), depth + 1));
            var grouping = type.GetInterfaces().FirstOrDefault(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IGrouping<,>));
            if (grouping != null)
            {
                var items = new JsonArray();
                foreach (var x in (IEnumerable)v) items.Add(Enc(x, depth + 1));
                return new JsonObject { ["k"] = Enc(grouping.GetProperty("Key")!.GetValue(v), depth + 1), ["v"] = items };
            }
            if (v is IEnumerable en)
            {
                var a = new JsonArray();
                var n = 0;
                foreach (var x in en)
                {
                    if (++n > 1000) { a.Add("…"); break; }
                    a.Add(Enc(x, depth + 1));
                }
                if (IsSequence(v)) return new JsonObject { ["seq"] = TypeName(type), ["items"] = a };
                return a;
            }
            if (type.FullName == "Aml.Engine.CAEX.InternalLinkType+LinkedObjects" || type.Name == "LinkedObjects")
            {
                var o = new JsonObject { ["$"] = TypeName(type) };
                foreach (var p in type.GetProperties().OrderBy(p => p.Name, StringComparer.Ordinal)) o[p.Name] = TryNode(() => Enc(p.GetValue(v), depth + 1));
                return o;
            }
            return "o:" + TypeName(type);
        }

        JsonNode? TryNode(Func<JsonNode?> f, string? key = null, [CallerLineNumber] int line = 0)
        {
            CountingIDService.Paused = false;
            try { return TryNode2(f, key, line); }
            finally { CountingIDService.Paused = true; }
        }

        JsonNode? TryNode2(Func<JsonNode?> f, string? key, int line)
        {
            if (_guard)
            {
                // Documents with cyclic references: some calls do not return, either by recursing
                // until the stack overflows (which ends the process) or by looping forever. The
                // document runs in a child process (RunIsolated); every guarded call gets a number,
                // and a call that ended the child is recorded under its number and not made again.
                var call = ++_calls;
                if (Skipped.TryGetValue(call, out var why)) return why;
                WriteProbe(call);
                var t = Task.Run(() =>
                {
                    try { return f(); }
                    catch (Exception e) { return (JsonNode?)("!" + Unwrap(e).GetType().Name); }
                });
                if (t.Wait(HangMs)) return t.Result;
                // no return within the limit: the parent records "!hang" for this call
                Environment.Exit(3);
            }
            try { return f(); }
            catch (Exception e) { return "!" + Unwrap(e).GetType().Name; }
        }

        bool _guard;
        int _calls;

        /// <summary>A call that has not returned after this time is taken to loop forever.</summary>
        public const int HangMs = 3000;

        static FileStream? _probeStream;

        /// <summary>The number of the call about to be made, for the parent if this call ends the process.</summary>
        static void WriteProbe(int call)
        {
            if (Probe == null) return;
            // opened once: the written bytes reach the file even when the process is ended
            _probeStream ??= new FileStream(Probe, FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
            var bytes = Encoding.ASCII.GetBytes(call.ToString(CultureInfo.InvariantCulture).PadRight(12));
            _probeStream.Position = 0;
            _probeStream.Write(bytes);
            _probeStream.Flush();
        }

        /// <summary>
        /// Calls that ended the child before ("n=!stackoverflow" or "n=!hang", comma separated): from
        /// READS_SKIP, or with READS_SKIP_STDIN from the first line of stdin, read once the child has
        /// done everything that comes before the first guarded call (RunIsolated starts it ahead).
        /// </summary>
        static Dictionary<int, string> Skipped = ParseSkip(Environment.GetEnvironmentVariable("READS_SKIP"));

        static Dictionary<int, string> ParseSkip(string? list) =>
            (list ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Split('=')).ToDictionary(x => int.Parse(x[0], CultureInfo.InvariantCulture), x => x[1]);

        static readonly string? Probe = Environment.GetEnvironmentVariable("READS_PROBE");
    }

    // ------------------------------------------------------------------------------------------
    static readonly JsonSerializerOptions JsonOpts = new() { Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    static object? Invoke(MethodInfo m, object? target, object?[] args)
    {
        var r = m.Invoke(target, args);
        return r;
    }

    static Exception Unwrap(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException;
        while (e is AggregateException { InnerException: not null } a) e = a.InnerException;
        return e;
    }

    public static string TypeName(Type t)
    {
        var n = t.Name;
        var k = n.IndexOf('`');
        if (k >= 0) n = n.Substring(0, k);
        if (t.IsNested && t.DeclaringType != null && t.DeclaringType.Assembly == Asm) n = TypeName(t.DeclaringType) + "_" + n;
        return n;
    }

    public static string Camel(string s)
    {
        var i = 0;
        while (i < s.Length && char.IsUpper(s[i])) i++;
        if (i == 0) return s;
        if (i == s.Length) return s.ToLowerInvariant();
        if (i > 1 && char.IsLower(s[i])) i--;
        return s.Substring(0, i).ToLowerInvariant() + s.Substring(i);
    }

    /// <summary>
    /// SaveToFile writes the file name into the document: always the same name, in a directory of
    /// its own per process (the isolated documents run in parallel child processes).
    /// </summary>
    static string TmpFile()
    {
        var dir = Path.Combine(Path.GetTempPath(), "reads-oracle-cs", Environment.ProcessId.ToString(System.Globalization.CultureInfo.InvariantCulture));
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, "reads-save.aml");
    }

    /// <summary>Deterministic IDs: 00000000-0000-4000-8000-000000000001, ... (restarted per document).</summary>
    sealed class CountingIDService : ICaexIDService
    {
        int _n;
        public string GenerateNewID(CAEXObject caexObject) => GenerateNewID();
        public string GenerateNewID(XElement caexElement) => GenerateNewID();
        /// <summary>
        /// While set (the oracle's own bookkeeping, e.g. the first element of an empty sequence, a
        /// wrapper without node whose constructor asks for an ID), IDs come from a second counter so
        /// that the numbering of the recorded calls matches the JS runner.
        /// </summary>
        public static bool Paused = true;
        int _p;

        public string GenerateNewID()
        {
            if (Paused) return "00000000-0000-4000-9000-" + (++_p).ToString("D12");
            ++_n;
            if (Environment.GetEnvironmentVariable("READS_TRACE_IDS") != null) Console.Error.WriteLine($"id {_n} at line {Lines + 1}");
            return "00000000-0000-4000-8000-" + _n.ToString("D12");
        }

        public static int Lines;
    }

    static bool IsCyclic(string file) => Path.GetFileName(file).StartsWith("cyclic");

    /// <summary>
    /// Documents with cyclic references: some calls of the original do not return. A stack overflow
    /// ends the .NET process and cannot be caught, and a call that loops forever cannot be stopped.
    /// The document is therefore run in a child process that writes the number of each guarded
    /// call to a probe file before making it. When the child ends early, the call in the probe
    /// file is recorded ("!stackoverflow" for the stack overflow exit code, "!hang" for a call that
    /// did not return within Ctx.HangMs) and the child is started again with that call left out.
    /// All other calls are recorded as usual, so the JS runner compares everything that returns
    /// and checks that the port throws CyclicReferenceException where the original does not return.
    /// Most of a run is the start of the child (loading, the load variants, the pools), so the next
    /// child is always started ahead and waits for its skip list on stdin. The calls found so far
    /// are kept in &lt;outDir&gt;/&lt;name&gt;.noreturn.txt until the document is done, so an
    /// interrupted run goes on where it stopped.
    /// </summary>
    static void RunIsolated(string outDir, string file)
    {
        const int StackOverflowExit = unchecked((int)0xC00000FD);
        // the calls found so far, kept in a file so that an interrupted run can go on
        var name = Path.GetFileNameWithoutExtension(file);
        var skipFile = Path.Combine(outDir, name + ".noreturn.txt");
        var skip = File.Exists(skipFile) ? File.ReadAllLines(skipFile).Where(l => l.Length > 0).ToList() : new List<string>();
        var sw = System.Diagnostics.Stopwatch.StartNew();
        var started = 0;
        (System.Diagnostics.Process P, string Probe, Task<string> Out, Task<string> Err) Start()
        {
            var probe = Path.Combine(Path.GetTempPath(), $"reads-oracle-probe-{Environment.ProcessId}-{name}-{started++}.txt");
            if (File.Exists(probe)) File.Delete(probe);
            var psi = new System.Diagnostics.ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true, RedirectStandardInput = true };
            psi.ArgumentList.Add(typeof(ReadsOracle).Assembly.Location);
            psi.ArgumentList.Add("reads");
            psi.ArgumentList.Add(outDir);
            psi.ArgumentList.Add(file);
            psi.Environment["READS_CHILD"] = "1";
            psi.Environment["READS_SKIP_STDIN"] = "1";
            psi.Environment["READS_PROBE"] = probe;
            var p = System.Diagnostics.Process.Start(psi)!;
            return (p, probe, p.StandardOutput.ReadToEndAsync(), p.StandardError.ReadToEndAsync());
        }
        var next = Start();
        try
        {
            for (var attempt = 0; attempt < 5000; attempt++)
            {
                var child = next;
                child.P.StandardInput.WriteLine(string.Join(",", skip));
                child.P.StandardInput.Close();
                next = Start();
                child.P.WaitForExit();
                var call = File.Exists(child.Probe) ? File.ReadAllText(child.Probe).Trim() : "";
                File.Delete(child.Probe);
                if (child.P.ExitCode == 0)
                {
                    File.Delete(skipFile);
                    Console.Write(child.Out.Result);
                    Console.WriteLine($"   {skip.Count} calls without return ({skip.Count(x => x.EndsWith("!stackoverflow"))} stack overflows, {skip.Count(x => x.EndsWith("!hang"))} endless), {attempt + 1} runs, {sw.ElapsedMilliseconds / 1000} s");
                    return;
                }
                // a stack overflow can also end with an access violation while the runtime reports it
                var overflow = child.P.ExitCode == StackOverflowExit || child.Err.Result.StartsWith("Stack overflow.", StringComparison.Ordinal);
                var why = overflow ? "!stackoverflow" : child.P.ExitCode == 3 ? "!hang" : null;
                if (call.Length == 0 || why == null || skip.Any(x => x.StartsWith(call + "=")))
                    throw new Exception($"child failed on {file} (exit {child.P.ExitCode}, call {call}): {child.Err.Result[..Math.Min(2000, child.Err.Result.Length)]}");
                skip.Add(call + "=" + why);
                File.AppendAllLines(skipFile, new[] { call + "=" + why });
                if (skip.Count % 25 == 0) Console.Error.WriteLine($"   {Path.GetFileName(file)}: {skip.Count} calls without return so far (at call {call}, {sw.ElapsedMilliseconds / 1000} s)");
            }
            throw new Exception("too many calls without return: " + file);
        }
        finally
        {
            if (!next.P.HasExited) next.P.Kill(true);
            next.P.WaitForExit();
            if (File.Exists(next.Probe)) File.Delete(next.Probe);
        }
    }

    static string? Try2(Func<string?> f)
    {
        try { return f(); } catch { return null; }
    }

    static JsonNode? Try(Func<string?> f)
    {
        try { return f(); }
        catch (Exception e) { return "!" + Unwrap(e).GetType().Name; }
    }

    static string Save(CAEXDocument doc, bool pretty)
    {
        using var s = doc.SaveToStream(pretty);
        s.Position = 0;
        return new StreamReader(s).ReadToEnd();
    }

    static string Hash(string text) => Hash(Encoding.UTF8.GetBytes(text));

    static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).Substring(0, 16);

    /// <summary>GUIDs by order of appearance (G1, G2, ...), timestamps of "now" as NOW; see ops test.</summary>
    sealed class Canonicalizer
    {
        readonly Dictionary<string, string> _map = new();
        static readonly Regex Guid = new("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        static readonly Regex Us = new(@"(\d{2})/(\d{2})/(\d{4}) \d{2}:\d{2}:\d{2}");
        static readonly Regex Iso = new(@"(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?");

        static bool Recent(int y, int mo, int d)
        {
            try { return Math.Abs((new DateTime(y, mo, d) - DateTime.Today).TotalDays) <= 1.05; }
            catch { return false; }
        }

        public string Apply(string text)
        {
            text = Us.Replace(text, m => Recent(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)) ? "NOW" : m.Value);
            text = Iso.Replace(text, m => Recent(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)) ? "NOW" : m.Value);
            return Guid.Replace(text, m =>
            {
                var k = m.Value.ToLowerInvariant();
                if (!_map.TryGetValue(k, out var id)) { id = "G" + (_map.Count + 1); _map[k] = id; }
                return id;
            });
        }

        /// <summary>Applies the canonicalization to every string of a JSON tree, in document order.</summary>
        public JsonNode? Walk(JsonNode? n)
        {
            switch (n)
            {
                case null: return null;
                case JsonArray a:
                    var na = new JsonArray();
                    foreach (var x in a) na.Add(Walk(x?.DeepClone()));
                    return na;
                case JsonObject o:
                    var no = new JsonObject();
                    foreach (var (k, x) in o) no[k] = Walk(x?.DeepClone());
                    return no;
                case JsonValue v when v.GetValueKind() == JsonValueKind.String:
                    return Apply(v.GetValue<string>());
                default: return n.DeepClone();
            }
        }
    }

    static void List()
    {
        foreach (var t in Asm.GetExportedTypes().OrderBy(t => t.FullName))
        {
            if (t.IsAbstract && t.IsSealed)
            {
                foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly))
                    Console.WriteLine($"S\t{t.FullName}\t{m.Name}\t{(m.IsDefined(typeof(ExtensionAttribute)) ? "ext" : "")}\t{m.ReturnType.Name}\t{string.Join(",", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name))}\t{(m.IsGenericMethod ? "generic" : "")}");
                continue;
            }
            foreach (var p in t.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly))
                Console.WriteLine($"P\t{t.FullName}\t{p.Name}\t{p.PropertyType.Name}\t{string.Join(",", p.GetIndexParameters().Select(x => x.ParameterType.Name))}");
            foreach (var m in t.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly).Where(m => !m.IsSpecialName))
                Console.WriteLine($"M\t{t.FullName}\t{m.Name}\t{(m.IsStatic ? "static" : "")}\t{m.ReturnType.Name}\t{string.Join(",", m.GetParameters().Select(p => p.ParameterType.Name + " " + p.Name))}\t{(m.IsGenericMethod ? "generic" : "")}");
        }
    }
}
