// Port of Aml.Engine.CAEX.Commands.CAEXElementChangeMode ([Flags]).

/** Change modes of a CAEX element change event (flags). */
export enum CAEXElementChangeMode {
  /** No change. */
  None = 0,
  /** An element has been added. */
  Added = 1,
  /** An element will be deleted. */
  Deleting = 4,
  /** The ID of an element has changed. */
  IDChanged = 8,
  /** The ID of an element will change. */
  IDChanging = 0x10,
  /** An ID reference has changed. */
  IDRefChanged = 0x20,
  /** An ID reference will change. */
  IDRefChanging = 0x40,
  /** The name of an element has changed. */
  NameChanged = 0x80,
  /** The name of an element will change. */
  NameChanging = 0x100,
  /** A name reference has changed. */
  NameRefChanged = 0x200,
  /** A name reference will change. */
  NameRefChanging = 0x400,
  /** A path reference has changed. */
  PathRefChanged = 0x800,
  /** A path reference will change. */
  PathRefChanging = 0x1000,
  /** An element has been deleted. */
  Deleted = 0x2000,
  /** A value has changed. */
  ValueChanged = 0x4000,
  /** A value will change. */
  ValueChanging = 0x8000,
  /** An element will be moved. */
  Moving = 0x10000,
  /** An element has been moved. */
  Moved = 0x20000,
  /** All modes raised with the changed event. */
  ChangedEvent = 0x26aa9,
  /** All modes raised with the changing event. */
  ChangingEvent = 0x19554,
}
