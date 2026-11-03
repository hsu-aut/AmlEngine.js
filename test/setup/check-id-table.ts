// With AMLENGINE_CHECK_ID_TABLE set, every QueryService.findByID without ID table is compared with
// the search of the original (the whole document from the start), and a difference throws. FindByID
// keeps what its searches have seen while no element or attribute changes (QueryService.ts,
// firstWithID); this checks over all tests that the result is still the one of the original:
//   AMLENGINE_CHECK_ID_TABLE=1 npx vitest run
// Without the variable nothing is loaded.

export {};

if (process.env.AMLENGINE_CHECK_ID_TABLE) {
  const { QueryService } = await import('../../src/engine/services/QueryService.js');
  const { CAEXPathBuilder } = await import('../../src/engine/caex/extensions/CAEXPathBuilder.js');
  const { XmlOperation } = await import('../../src/engine/xmlext/XmlOperation.js');
  const { T } = await import('../../src/engine/registry.js');
  const { isNullOrEmpty } = await import('../../src/system/strings.js');
  const { XName, firstDescendant } = await import('../../src/xml/index.js');

  const ID = XName.get('ID');
  const findByID = QueryService.prototype.findByID;
  QueryService.prototype.findByID = function (this: any, doc: any, id: string | null, resolveAlias = true, elementType: any = null) {
    const result = findByID.call(this, doc, id, resolveAlias, elementType);
    if (doc === null || doc === undefined || isNullOrEmpty(id) || !isNullOrEmpty(CAEXPathBuilder.aliasFromReference(id, doc.schema))) return result;
    const lookup = this._IDLookup;
    if (lookup !== null && lookup.size > 0 && lookup.get(doc) !== undefined) return result;
    const plain = firstDescendant(doc.xDocument, (x) => id === (x.attribute(ID)?.value ?? null));
    const same = result !== null ? result.node === plain : plain === null || !(XmlOperation.createCAEXWrapper(plain) instanceof T.CAEXObject);
    if (!same) throw new Error(`FindByID("${id}") differs from the search of the original`);
    return result;
  };
}
