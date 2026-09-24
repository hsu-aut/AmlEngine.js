// An AutomationML library embedded as a resource in Aml.Engine.Resources 4.2.1 (see
// scripts/gen-aml-libraries.mjs).

/** An embedded resource: its manifest resource name and its content. */
export interface EmbeddedLibrary {
  /** The manifest resource name, e.g. `Aml.Engine.Resources.Resources.CAEX3_0.AML2_10.AutomationMLBaseRoleClassLib.aml`. */
  readonly name: string;
  /** Whether the resource starts with the UTF-8 preamble (EF BB BF). */
  readonly bom: boolean;
  /** The text of the resource without the preamble. */
  readonly text: string;
}

/** The bytes of the resource, identical to `Assembly.GetManifestResourceStream(name)`. */
export function embeddedLibraryBytes(library: EmbeddedLibrary): Uint8Array {
  const body = new TextEncoder().encode(library.text);
  if (!library.bom) return body;
  const bytes = new Uint8Array(body.length + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(body, 3);
  return bytes;
}
