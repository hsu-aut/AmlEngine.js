using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Xml;
using Aml.Engine.CAEX;
using Aml.Engine.Resources.Files;
using Aml.Engine.Services.Model;

namespace Oracle;

// Section "model": Aml.Engine.Services.Model (library server profiles with their JSON form and
// encrypted passwords, AMLEditionEnumExtension, XMLSignature/SignedInfo/KeyInfo/KeyValue) and the
// internal ByteArrayConverter.
public static partial class GapsServicesOracle
{
    const string Dsig = "http://www.w3.org/2000/09/xmldsig#";

    sealed class TestKeyValue : KeyValue
    {
        string? modulus;
        public override string GetPublicKey() => modulus!;
        public override void LoadXml(XmlElement element) => modulus = element.InnerText;
        public override XmlElement GetXml(XmlDocument document)
        {
            var kv = base.GetXml(document);
            var r = document.CreateElement("RSAKeyValue", Dsig);
            r.AppendChild(document.CreateTextNode(modulus ?? ""));
            kv.AppendChild(r);
            return kv;
        }
    }

    static readonly PropertyInfo HashProp = typeof(PasswordProtected).GetProperty("PasswordHash", BindingFlags.Instance | BindingFlags.NonPublic)!;
    static string? GetHash(PasswordProtected p) => (string?)HashProp.GetValue(p);
    static void SetHash(PasswordProtected p, string? h) => HashProp.SetValue(p, h);

    static string DP(AMLLibraryServerDataProfile? d) =>
        d == null ? "null" : $"DP({d.AutomationMLEdition}|{(int)d.ContentType}|{N(d.Folder)}|{N(d.UserName)}|{N(d.BranchOrTag)}|{B(GetHash(d) == null)}|{B(d.IsAnonymous)})";

    static void Profile(Rec r, string p, AMLLibraryServerProfile s)
    {
        r.V(p + ":json", () => s.Serialize());
        r.V(p + ":props", () => $"{B(s.IsAnonymous)}|{B(s.CanTryLogin)}|{s.ProtocolName}|{s.ServerURL}|{DP(s.LibraryCatalogData)}|{DP(s.ClassCatalogData)}|{DP(s.SignatureData)}");
        r.V(p + ":password", () => s.Password);
        r.V(p + ":dataPasswords", () => string.Join(",", (s.LibraryData ?? new()).Select(d => d == null ? "null" : N(d.Password))));
    }

    static void ModelSection(JsonObject o)
    {
        Case(o, "profiles", ProfileLoadCases);
        Case(o, "profileFiles", ProfileFileCases);
        Case(o, "profileApi", ProfileApiCases);
        Case(o, "profileUri", ProfileUriCases);
        Case(o, "dataProfile", DataProfileCases);
        Case(o, "hashes", HashCases);
        Case(o, "edition", EditionCases);
        Case(o, "byteArray", ByteArrayCases);
        Case(o, "signature", SignatureCases);
        // Hashes made by System.Security.Cryptography, decrypted by the port in the test.
        var own = new JsonArray();
        foreach (var plain in new[] { "secret", "pässwörd €", "x", new string('y', 16), "日本語" })
        {
            var d = new AMLLibraryServerDataProfile { Password = plain };
            own.Add(new JsonObject { ["plain"] = plain, ["hash"] = GetHash(d) });
        }
        File.WriteAllText(Path.Combine(Path.GetDirectoryName(workDir)!, "model-hashes.json"), own.ToJsonString());
    }

    static void ProfileLoadCases(Rec r)
    {
        var profiles = JsonNode.Parse(File.ReadAllText(Path.Combine(inputDir, "profiles.json"), Encoding.UTF8))!.AsArray();
        for (var i = 0; i < profiles.Count; i++)
        {
            var text = profiles[i]!.GetValue<string>();
            AMLLibraryServerProfile? s = null;
            r.V("#" + i, () => { s = AMLLibraryServerProfile.LoadFromString(text); return "ok"; });
            if (s != null) Profile(r, "#" + i, s);
        }
        r.V("null", () => AMLLibraryServerProfile.LoadFromString(null!));
    }

    static void ProfileFileCases(Rec r)
    {
        var profiles = JsonNode.Parse(File.ReadAllText(Path.Combine(inputDir, "profiles.json"), Encoding.UTF8))!.AsArray();
        var text = profiles[1]!.GetValue<string>();
        var dir = Path.Combine(workDir, "profiles");
        Directory.CreateDirectory(dir);
        var variants = new (string, byte[])[]
        {
            ("utf8", Encoding.UTF8.GetBytes(text)),
            ("utf8bom", new byte[] { 0xEF, 0xBB, 0xBF }.Concat(Encoding.UTF8.GetBytes(text)).ToArray()),
            ("utf16le", new byte[] { 0xFF, 0xFE }.Concat(Encoding.Unicode.GetBytes(text)).ToArray()),
            ("utf16be", new byte[] { 0xFE, 0xFF }.Concat(Encoding.BigEndianUnicode.GetBytes(text)).ToArray()),
            ("utf32le", new byte[] { 0xFF, 0xFE, 0x00, 0x00 }.Concat(Encoding.UTF32.GetBytes(text)).ToArray()),
            ("utf16leNoBom", Encoding.Unicode.GetBytes("{\"UserName\":\"x\"}")),
            ("latin1", Encoding.Latin1.GetBytes("{\"UserName\":\"\u00e9\"}")),
            ("empty", Array.Empty<byte>()),
        };
        foreach (var (name, bytes) in variants)
        {
            var path = Path.Combine(dir, name + ".json");
            File.WriteAllBytes(path, bytes);
            AMLLibraryServerProfile? s = null;
            r.V(name, () => { s = AMLLibraryServerProfile.LoadFromFile(path); return "ok"; });
            if (s != null) Profile(r, name, s);
        }
        r.V("missing", () => AMLLibraryServerProfile.LoadFromFile(Path.Combine(dir, "missing.json")));
    }

    static void ProfileApiCases(Rec r)
    {
        var s = new AMLLibraryServerProfile();
        Profile(r, "new", s);
        r.V("constants", () => AMLLibraryServerProfile.ANONYMOUS + "|" + AMLLibraryServerProfile.LoginWarning);
        for (var i = 0; i < 4; i++)
        {
            s.LoginFailed();
            r.V("failed" + i, () => s.CanTryLogin);
        }
        r.Do("reset", () => s.ResetFailedLogins());
        r.V("afterReset", () => s.CanTryLogin);
        r.Do("block", () => s.Block());
        r.V("afterBlock", () => s.CanTryLogin);
        foreach (var pw in new[] { "pw", "", null, "ä€\u0000x", new string('z', 100) })
        {
            r.Do("setPassword:" + N(pw), () => s.Password = pw!);
            r.V("password:" + N(pw), () => N(s.Password) + "|" + B(GetHash(s) == null));
        }
        foreach (var user in new[] { "anonymous", "Anonymous", null, "" })
        {
            s.UserName = user!;
            r.V("anonymous:" + N(user), () => s.IsAnonymous);
        }
        foreach (var p in new[] { 0, 1, 2, 3, 4, 5, -1 })
        {
            s.NetworkProtocol = (NetworkProtocolEnum)p;
            s.ServerName = p == 2 ? null! : "srv";
            r.V("protocol:" + p, () => s.ProtocolName + "|" + s.ServerURL);
        }
        // Credentials and base address.
        s.UserName = "su";
        s.Password = "spw";
        foreach (var (du, dp) in new (string?, string?)[] { (null, null), ("", ""), (" ", " "), ("du", "dpw"), ("du", null) })
        {
            var d = new AMLLibraryServerDataProfile { UserName = du! };
            if (dp != null) d.Password = dp;
            r.V($"credentials:{N(du)}:{N(dp)}", () => { var c = s.Credentials(d); return N(c.UserName) + "|" + N(c.Password); });
        }
        r.V("credentialsNull", () => s.Credentials(null!));
        foreach (var ba in new[] { "plain", "a/%UserName/b", "%UserName%UserName", "", null })
        {
            s.BaseAddress = ba!;
            r.V("base:" + N(ba) + ":null", () => s.GetResolvedBaseAddress(null!));
            r.V("base:" + N(ba) + ":data", () => s.GetResolvedBaseAddress(new AMLLibraryServerDataProfile { UserName = "du" }));
            r.V("base:" + N(ba) + ":dataEmpty", () => s.GetResolvedBaseAddress(new AMLLibraryServerDataProfile { UserName = "" }));
        }
        // Data lookup by content type and edition.
        var t = new AMLLibraryServerProfile
        {
            LibraryData = new() { new(AMLFileContentType.LibraryFile) { AutomationMLEdition = AMLEditionEnum.Edition1, Folder = "L1" }, new(AMLFileContentType.LibraryFile) { Folder = "Lall" } },
            LibraryCollectionData = new() { new(AMLFileContentType.LibraryCollectionFile) { AutomationMLEdition = AMLEditionEnum.Edition2 } },
            ExampleData = new() { new(AMLFileContentType.ExampleFile) { AutomationMLEdition = AMLEditionEnum.Edition2 }, new(AMLFileContentType.ExampleFile) { AutomationMLEdition = AMLEditionEnum.Edition1 } },
            AdministrationData = new() { new(AMLFileContentType.LibraryCatalog), new(AMLFileContentType.ClassRepository), new(AMLFileContentType.SignatureData) },
            BackupData = new(AMLFileContentType.BackupData),
        };
        Profile(r, "lookup", t);
        for (var ct = 0; ct <= 8; ct++)
            foreach (var ed in new[] { AMLEditionEnum.Edition1, AMLEditionEnum.Edition2, AMLEditionEnum.AllEditions })
                r.V($"getData:{ct}:{ed}", () => DP(t.GetData(new AMLLibraryServerDataProfile { ContentType = (AMLFileContentType)ct, AutomationMLEdition = ed })));
        foreach (var name in new[] { "_0_Lib_AMLEd1", "_0_Lib_AMLEd2", "_1_Coll_AMLEd2", "_2_Ex_AMLEd1", "_2_Ex_x", "_3_Cat", "_4_Class", "_5_Sig", "_6_B", "_7_x", "plain.aml", "_9_x", "a", "", "x_AMLEd1" })
            r.V("restore:" + name, () => { var d = t.RestorationData(name, out var orig); return DP(d) + "|" + N(orig); });
        foreach (var key in new[] { "docs:map30.aml", "docs:map215.aml", "1_AMLBaseLibraries.aml", "AutomationML_Base_Libraries_AMLEd2_2.11.0.aml", "0_EmptyFile_V2.0.aml" })
        {
            var d = Doc(key);
            r.V("forDoc:" + key, () => DP(t.LibraryDataForDocument(d)) + DP(t.LibraryCollectionDataForDocument(d)) + DP(t.ExampleDataForDocument(d)));
        }
        var nulls = new AMLLibraryServerProfile { LibraryData = null!, AdministrationData = null! };
        r.V("nullLists", () => DP(nulls.LibraryCatalogData) + DP(nulls.GetData(new AMLLibraryServerDataProfile())));
        r.V("nullListsJson", () => nulls.Serialize());
        r.V("nullListsForDoc", () => DP(nulls.LibraryDataForDocument(Doc("docs:map30.aml"))));
        // Serialization with fixed password hashes and characters that need escaping.
        var hashes = JsonNode.Parse(File.ReadAllText(Path.Combine(inputDir, "hashes.json"), Encoding.UTF8))!.AsArray();
        SetHash(t, hashes[0]!["hash"]!.GetValue<string>());
        SetHash(t.LibraryData[0], hashes[2]!["hash"]!.GetValue<string>());
        t.UserName = "a\"b\\c/d<e>f&g'h+i`j\u00e9\u2028\ud83d\ude00\t\r\n\u0001\u007f";
        t.ServerName = "s";
        t.BaseAddress = "b";
        t.BranchName = null!;
        t.IsPublicRepository = true;
        t.PortNumber = -5;
        t.AccessRights = (AccessRightsEnum)9;
        r.V("serialized", () => t.Serialize());
        r.V("reloaded", () => AMLLibraryServerProfile.LoadFromString(t.Serialize()).Serialize());
        r.V("reloadedPasswords", () => { var x = AMLLibraryServerProfile.LoadFromString(t.Serialize()); return x.Password + "|" + x.LibraryData[0].Password; });
    }

    static void ProfileUriCases(Rec r)
    {
        var servers = new[] { "example.com", "example.com/", "github.com", "api.GitHub.com/x", null, "host:81", "a b", "" };
        var files = new[] { null, "f.aml", "/sub/f g.aml/", "a\\b.aml" };
        for (var p = 0; p <= 5; p++)
            foreach (var server in servers)
                for (var v = 0; v < 3; v++)
                {
                    var s = new AMLLibraryServerProfile { NetworkProtocol = (NetworkProtocolEnum)p, ServerName = server!, UserName = v == 0 ? null! : "u s", PortNumber = v == 1 ? 8080 : 0, BaseAddress = v == 2 ? "/repo/%UserName/" : v == 1 ? "base" : null! };
                    if (v == 1) s.Password = "p@ss:w";
                    var d = new AMLLibraryServerDataProfile { Folder = v == 0 ? null! : v == 1 ? "/Libs/" : "\\a\\b c", BranchOrTag = v == 2 ? "v1.0" : null! };
                    if (v == 2)
                    {
                        d.UserName = "du";
                        d.Password = "dp";
                    }
                    foreach (var f in files)
                    {
                        var label = $"{p}:{N(server)}:{v}:{N(f)}";
                        r.V(label, () => s.GetUri(d, f!));
                        r.V(label + ":dl", () => s.GetUri(d, f!, true));
                    }
                }
        r.V("nullData", () => new AMLLibraryServerProfile { ServerName = "x" }.GetUri(null!));
        r.V("nullDataGitHub", () => new AMLLibraryServerProfile { ServerName = "github.com" }.GetUri(null!));
    }

    static void DataProfileCases(Rec r)
    {
        r.V("constants", () => string.Join("|", AMLLibraryServerDataProfile.BACKUPFOLDER, AMLLibraryServerDataProfile.CATALOGUEFOLDER, AMLLibraryServerDataProfile.COLLECTIONFOLDER,
            AMLLibraryServerDataProfile.EXAMPLEFOLDER, AMLLibraryServerDataProfile.LIBFOLDER, AMLLibraryServerDataProfile.SIGNFOLDER));
        r.V("default", () => DP(new AMLLibraryServerDataProfile()));
        for (var ct = -1; ct <= 8; ct++)
            r.V("ctor:" + ct, () => DP(new AMLLibraryServerDataProfile((AMLFileContentType)ct)));
        foreach (var name in new[] { "lib.aml", "_0_lib.aml", "_3_lib.aml", "" })
            for (var ct = -1; ct <= 8; ct++)
                r.V($"backupName:{name}:{ct}", () => AMLLibraryServerDataProfile.BackupFileName(name, (AMLFileContentType)ct));
        r.V("backupNameNull", () => AMLLibraryServerDataProfile.BackupFileName(null!, 0));
        foreach (var name in new[] { "_0_lib.aml", "_6_x", "_7_x", "_8_x", "_9_x", "lib.aml", "ab", "a", "", "_1", "_1_", "x1y", "_٣_x", " 1 x", "_+_x", "_-_x" })
            r.V("backupType:" + name, () => { var t = AMLLibraryServerDataProfile.BackupFileType(name, out var orig); return (int)t + "|" + N(orig); });
        r.V("backupTypeNull", () => AMLLibraryServerDataProfile.BackupFileType(null!, out _));
        foreach (var ct in new[] { 6, 2 })
        {
            var d = new AMLLibraryServerDataProfile((AMLFileContentType)ct);
            foreach (var path in new[] { "C:\\dir\\_2_file.aml", "/x/_4_c.aml", "_1_f", "dir/plain.aml", "C:_5_x", "C:\\dir\\", "d:/x/_0_y" })
                r.V($"fromFile:{ct}:{path}", () => (int)d.ContentTypeFromFile(path));
        }
        foreach (var own in new[] { AMLEditionEnum.Edition1, AMLEditionEnum.Edition2, AMLEditionEnum.AllEditions, (AMLEditionEnum)7 })
            foreach (var ed in new[] { AMLEditionEnum.Edition1, AMLEditionEnum.Edition2, AMLEditionEnum.AllEditions, (AMLEditionEnum)7 })
                r.V($"supports:{(int)own}:{(int)ed}", () => new AMLLibraryServerDataProfile { AutomationMLEdition = own }.SupportsEdition(ed));
        foreach (var user in new[] { "anonymous", "x", null })
            r.V("anonymous:" + N(user), () => new AMLLibraryServerDataProfile { UserName = user! }.IsAnonymous);
    }

    static void HashCases(Rec r)
    {
        var hashes = JsonNode.Parse(File.ReadAllText(Path.Combine(inputDir, "hashes.json"), Encoding.UTF8))!.AsArray();
        for (var i = 0; i < hashes.Count; i++)
        {
            var d = new AMLLibraryServerDataProfile();
            var h = hashes[i]!["hash"]!.GetValue<string>();
            SetHash(d, h);
            r.V("#" + i, () => d.Password);
            var s = new AMLLibraryServerProfile();
            SetHash(s, h);
            r.V("#" + i + ":server", () => s.Password);
        }
        foreach (var plain in new[] { "secret", "pässwörd €", "", "x" })
        {
            var d = new AMLLibraryServerDataProfile { Password = plain };
            r.V("roundTrip:" + plain, () => N(d.Password) + "|" + (GetHash(d) == null ? "null" : Convert.FromBase64String(GetHash(d)!).Length.ToString()));
        }
    }

    static void EditionCases(Rec r)
    {
        var docs = new[] { "docs:map30.aml", "docs:map215.aml", "AutomationML_Base_Libraries_AMLEd2_2.11.0.aml", "0_EmptyFile_V2.0.aml" }.Select(Doc).ToList();
        foreach (var ed in new[] { AMLEditionEnum.Edition1, AMLEditionEnum.Edition2, AMLEditionEnum.AllEditions, (AMLEditionEnum)9 })
        {
            r.V("string:" + (int)ed, () => ed.AMLEditionString());
            for (var i = 0; i < docs.Count; i++)
            {
                var d = docs[i];
                r.V($"isDoc:{(int)ed}:{i}", () => ed.IsDocumentEdition(d));
            }
        }
        foreach (var v in new[] { "2.0", "2.1", "2.10", "2.2", "", "x", null })
        {
            r.V("fromVersion:" + N(v), () => v!.AMLEditionStringFromVersion() + "|" + v!.AMLEditionFromVersion());
            r.V("fromEdition:" + N(v), () => v!.AMLEditionFromEditionString());
        }
        foreach (var v in new[] { "AMLEd1", "AMLEd2", "amled1", "AMLEd3" })
            r.V("fromEdition:" + v, () => v.AMLEditionFromEditionString());
    }

    static void ByteArrayCases(Rec r)
    {
        var conv = (JsonConverter)Activator.CreateInstance(typeof(AMLLibraryServerProfile).Assembly.GetType("Aml.Engine.Services.Utilities.ByteArrayConverter", true)!, true)!;
        var options = new JsonSerializerOptions();
        options.Converters.Add(conv);
        foreach (var b in new[] { Array.Empty<byte>(), new byte[] { 0, 1, 127, 128, 255 } })
            r.V("write:" + b.Length, () => JsonSerializer.Serialize(b, options));
        foreach (var json in new[] { "[]", "[1,2,3]", "[255,-1,256,300]", "null", "[-32768,32767]" })
            r.V("read:" + json, () => { var b = JsonSerializer.Deserialize<byte[]>(json, options); return b == null ? "null" : "[" + string.Join(",", b) + "]"; });
    }

    /// <summary>Canonical text of an XML element: name, attributes (without namespace declarations), children.</summary>
    static string CX(XmlNode? n)
    {
        switch (n)
        {
            case null: return "null";
            case XmlElement e:
            {
                var sb = new StringBuilder("{" + e.NamespaceURI + "}" + e.LocalName + (e.IsEmpty ? "/" : "") + "[");
                sb.Append(string.Join(";", e.Attributes.Cast<XmlAttribute>().Where(a => a.Prefix != "xmlns" && a.Name != "xmlns").Select(a => "{" + a.NamespaceURI + "}" + a.LocalName + "=" + a.Value)));
                sb.Append("](");
                // An empty text node (XmlDocument) and empty string content (XLinq) both serialize as <a></a>.
                sb.Append(string.Join(",", e.ChildNodes.Cast<XmlNode>().Where(c => !(c is XmlText { Value: "" })).Select(CX)));
                return sb.Append(')').ToString();
            }
            default: return "'" + n.Value + "'";
        }
    }

    static XmlElement XE(string xml)
    {
        var d = new XmlDocument();
        d.LoadXml(xml);
        return d.DocumentElement!;
    }

    static string Sig(XMLSignature s) =>
        $"{N(s.Id)}|{N(s.SignatureValue)}|{(s.SignedInfo == null ? "null" : N(s.SignedInfo.SignatureMethod))}|{(s.KeyInfo == null ? "null" : s.KeyInfo.KeyValue == null ? "nokv" : N(s.KeyInfo.KeyValue.GetPublicKey()))}";


    static void SignatureCases(Rec r)
    {
        KeyValue.Constructors["RSAKeyValue"] = () => new TestKeyValue();
        var Signatures = JsonNode.Parse(File.ReadAllText(Path.Combine(inputDir, "signatures.json"), Encoding.UTF8))!.AsArray().Select(n => n!.GetValue<string>()).ToArray();
        for (var i = 0; i < Signatures.Length; i++)
        {
            var text = Signatures[i];
            var s = new XMLSignature();
            r.Do("load#" + i, () => s.LoadFromString(text));
            r.V("sig#" + i, () => Sig(s));
            r.V("xml#" + i, () => CX(s.GetXml()));
            r.V("xmlDoc#" + i, () => CX(s.GetXml(new XmlDocument())));
            var s2 = new XMLSignature();
            r.Do("loadDoc#" + i, () => { var d = new XmlDocument(); d.LoadXml(text); s2.LoadFromDocument(d); });
            r.V("sigDoc#" + i, () => Sig(s2));
        }
        r.V("loadNull", () => { new XMLSignature().LoadXml(null!); return "ok"; });
        r.V("signedInfoNull", () => { new SignedInfo().LoadXml(null!); return "ok"; });
        r.V("keyInfoNull", () => { new KeyInfo().LoadXml(null!); return "ok"; });
        r.V("signedInfoWrong", () => { new SignedInfo().LoadXml(XE("<Other />")); return "ok"; });
        r.V("signedInfoOk", () => { var si = new SignedInfo(); si.LoadXml(XE("<X:SignedInfo xmlns:X='" + Dsig + "'><X:SignatureMethod Algorithm='z' /></X:SignedInfo>")); return si.SignatureMethod + "|" + CX(si.GetXml(new XmlDocument())); });
        r.V("keyInfoOk", () => { var ki = new KeyInfo(); ki.LoadXml(XE("<Anything xmlns:d='" + Dsig + "'><d:KeyValue><d:RSAKeyValue>k</d:RSAKeyValue></d:KeyValue></Anything>")); return ki.KeyValue.GetPublicKey() + "|" + CX(ki.GetXml(new XmlDocument())); });
        r.V("keyInfoNoValue", () => CX(new KeyInfo().GetXml(new XmlDocument())));
        r.V("signedInfoNullMethod", () => CX(new SignedInfo().GetXml(new XmlDocument())));
        r.V("emptySignature", () => CX(new XMLSignature().GetXml()));
        r.V("noValue", () => CX(new XMLSignature { SignedInfo = new SignedInfo { SignatureMethod = "m" } }.GetXml()));
        r.V("built", () => CX(new XMLSignature { Id = "id", SignatureValue = "v", SignedInfo = new SignedInfo { SignatureMethod = "m" } }.GetXml()));
        r.V("builtEmptyId", () => CX(new XMLSignature { Id = "", SignatureValue = "", SignedInfo = new SignedInfo() }.GetXml()));
        r.V("builtKeyInfoEmpty", () => CX(new XMLSignature { Id = "id", SignatureValue = "v", SignedInfo = new SignedInfo { SignatureMethod = "m" }, KeyInfo = new KeyInfo() }.GetXml()));
        foreach (var (s, off, cnt) in new[] { ("a b\tc\u00a0d\u2028e\u0085f\u200bg", -1, -1), ("  ", -1, -1), ("", -1, -1), ("a b c d", 1, 3), ("a b c d", 5, 10), ("a b", -1, 2), ("abc", 1, 0), ("abc", 1, -1) })
            r.V($"discard:{s}:{off}:{cnt}", () => off < 0 && cnt < 0 ? XMLSignature.DiscardWhiteSpaces(s) : XMLSignature.DiscardWhiteSpaces(s, off, cnt));
        r.V("discardNull", () => XMLSignature.DiscardWhiteSpaces(null!));
        var el = XE("<e Id='plain' xmlns:d='" + Dsig + "' d:Id='ns' d:Only='o' xmlns:o='urn:o' o:Other='x' />");
        foreach (var (name, ns) in new[] { ("Id", Dsig), ("Only", Dsig), ("Other", Dsig), ("Other", "urn:o"), ("Missing", Dsig), ("Id", "") })
            r.V($"getAttribute:{name}:{ns}", () => XMLSignature.GetAttribute(el, name, ns));
        r.V("constant", () => XMLSignature.XmlDsigNamespaceUrl);
        r.V("constructors", () => KeyValue.Constructors.Count);
    }
}
