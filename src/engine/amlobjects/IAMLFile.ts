// Port of Aml.Engine.AmlObjects.IAMLFile (Aml.Engine 4.5.2).

/**
 * This interface is implemented by CAEXDocument and AutomationMLContainer. It extends
 * IDisposable in C#: `dispose()` releases the file.
 */
export interface IAMLFile {
  /** The file path of the AutomationML file or container. */
  readonly filePath: string | null;

  /** IDisposable.Dispose. */
  dispose(): void;
}
