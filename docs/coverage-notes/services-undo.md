# Coverage notes: services-undo

Area: `UndoRedoService` of Aml.Engine.Services 4.3.1 (`src/services/UndoRedoService.ts`,
`src/services/undoredo/Transaction.ts`, `src/services/undoredo/MultiDocumentTransaction.ts`) and
its use by the engine: the places that call `ServiceLocator.undoRedoService`, above all the command
types of `src/engine/caex/commands`, which are undone and redone here.

Files: `oracle/ServicesUndoOracle.cs` (`svc-undo <scripts.json> <corpusDir> <out.json>`, output
`test/oracle-out/services/undo.json`), `test/services/undo.oracle.test.ts`,
`scripts/gen-services-undo.mjs` (seed 3682) writing `test/services/undo/scripts.json`. The engine
operations are those of the engine ops test (`EngineOpsOracle.Apply` and `test/engine/ops-apply.ts`,
unchanged) plus eight operations of the undo test that reach the remaining command types
(`seqMove` and `seqRemoveAll` on InternalElement, Attribute and ExternalInterface sequences,
`prependIE`, `recreate` = `RecreateAttributeInstance`, `constraint` = Constraint with nominal,
ordinal and unknown types and their values, `meta`/`delMeta` = `AMLFile.SetMetaInformation` and
`DeleteMetaInformation`, `superior` = `SuperiorStandardVersion` append and set).

## What is compared

294 scripts: 34 fixed scenarios and 260 random scripts of 28 operations, on a document A (new CAEX
3.0 or 2.15 documents and 15 small corpus files) and in 136 scripts a related document R. Each
script registers a new service, subscribes to `PropertyChanged` and to the static change events of
`CaexCommand`, and unregisters the service at the end, after disposing both documents (which calls
`RemoveDocument` of the service). Per step (8,105 steps) seven values are compared exactly:

- the result of the operation (exceptions as `!Name`, for the service operations with the message;
  not for `NullReferenceException`, which is a TypeError with the JS message in the port);
- every change event (mode, element, parent, attribute, old and new value, document, sender) and
  the `Execute`/`UnExecute` calls of test commands;
- the `PropertyChanged` property names (and that the sender is the service);
- per document: `CanUndo`, `CanRedo`, `UndoActions`, `RedoActions` (enumerated, most recent first);
- the SHA-256 prefix of both canonical documents (GUIDs and "now" time stamps canonicalized as in
  the engine ops test).

Then a final phase undoes everything of A, redoes everything of A, and the same for R, with the same
record per step (4,375 steps), and compares both final canonical texts and the result of `Dispose`.
A last test asserts that the scripts undo and redo every command type (the test wraps `Execute` and
`UnExecute` of the nine command classes while `Undo`/`Redo` runs).

Service operations: `Undo`/`Redo` (also with nothing to undo or redo), `BeginTransaction` (named,
unnamed (null), nested, with a related document, with the same document as related document),
`EndTransaction` (also without a begin, while paused, and after a multi document transaction),
`Pause`/`Resume` global and per document with nested counts, `ClearStacks`, `RemoveCommands`,
`LastModificationDate` (undo and redo), the time stamps of all three stacks (read from the private
field `_documentStacks`), lazy `UndoActions`/`RedoActions` (enumerated after a change) and a change
of the stack during their enumeration, `PushCommand` with test commands (named, unnamed, failing in
`Execute` or `UnExecute`, without document), every method with a null document, and `Unload` of a
document with stacks and of a paused document.

Not deterministic in the original, and therefore canonicalized:

- time stamps (`DateTime.Now.ToLongTimeString()`): recorded with every digit as 9 and whether
  `DateTime.TryParse` gives today's date (all are `99:99:99`, parsed to today);
- `LastModificationDate`: recorded as "min" for `default(DateTime)`, otherwise date (today or
  not), kind, whether it lies between the start of the script (truncated to seconds) and now, and
  its milliseconds (all are `today|Unspecified|recent|0`).

The output does not depend on the date of the oracle run.

## Results

All 295 tests pass (294 scripts and the command type check). Oracle run about 5 s; test about 20 s
(6 s of test time on an idle machine).

Confirmed against the original (the open points of `docs/port-notes/services-base.md`):

- time stamps are `HH:mm:ss` under the invariant culture of the oracle and parse to today's date
  with kind Unspecified;
- `UndoActions`/`RedoActions` list the most recent action first; an entry without display name
  (an unnamed transaction or test command) is listed as ``ValueTuple`2``; both are lazy, and a
  change of the enumerated stack makes the next step throw InvalidOperationException;
- `EndTransaction` after `BeginTransaction` with a related document: with another document it
  throws `Stack empty.` (or pops an outer transaction), with the same document it puts the empty
  related transaction on the undo stack and loses the commands. A `MultiDocumentTransaction` is only
  undone and redone when two of them are nested: ending the inner one puts the outer one on the undo
  stack, and its undo also undoes its related transaction (also when that transaction was ended and
  undone on its own document already, where the engine command then throws).
- an `UnExecute` that throws leaves the service in the undo state: nothing is recorded afterwards
  (kept error of the original).

## Port errors fixed

- `src/services/UndoRedoService.ts`: the Stack enumerator threw the message of `List<T>`; Stack
  lives in System.Collections, whose text is "Collection was modified after the enumerator was
  instantiated.".

## Deviations

None of the service. The scripts write `LastWritingDateTime` only with dates from 1999 on: with no
date, `SetSourceDocumentInformation` writes `DateTime.MinValue` as local time, which hits the
documented deviation "Local time of old dates" (docs/deviations.md; +00:53 in the port, +01:00 in
.NET on Windows for Europe/Berlin).

## Coverage

`npx vitest run test/services/undo.oracle.test.ts --coverage --coverage.provider=v8
--coverage.include=<file>`:

| File | Statements | Branches | Functions |
|---|---|---|---|
| `src/services/UndoRedoService.ts` | 98.85 % | 91.73 % | 100 % |
| `src/services/undoredo/Transaction.ts` | 90.47 % | 75 % | 85.71 % |
| `src/services/undoredo/MultiDocumentTransaction.ts` | 100 % | 100 % | 100 % |
| `src/engine/caex/commands/*` (per file) | 80 to 100 % | 50 to 100 % | 57 to 100 % |

Not covered, and why:

- `Stack.peek` on an empty stack: every `Peek` of the service is guarded by a count check
  (`Count > 0`, `CanUndo`, `CanRedo`); unreachable in the original too.
- `beginTransactionOfDocument` returning null for a null document, an undo in progress or a global
  pause: the public `BeginTransaction` checks the same conditions first.
- `Transaction.caexDocument`: the service never reads the document of a transaction (transactions
  are never passed to `PushCommand`, and the C# class is internal).
- `Transaction` enumeration changed during `Execute`: the executing transaction was popped from the
  redo stack and is on no transaction stack, so nothing can add to it.

Every command type of `src/engine/caex/commands` is undone and redone (AddCmd, AddNewCmd,
InsertCmd, InsertNewCmd, MoveCmd, RemoveCmd, SetAttributeValueCmd, SetElementContentCmd,
SetElementValueCmd); no type is missing. The uncovered lines of those files are not undo paths of
the service:

- `CaexCommand.displayName` and `xDocument`: never read. Engine commands always run inside the
  transaction of their static helper, so `UndoActions` lists the transaction, not the command.
- the internal getters of SetAttributeValueCmd, SetElementContentCmd and SetElementValueCmd: not
  read by the engine.
- the paths of the static helpers for elements outside a document (no service call).
- `MoveCmd.UnExecute` for an element without siblings: impossible, the moved element and its
  target are children of the same owner.
- `RemoveCmd.UnExecute` for an element that is in a document again (the caller would have to
  insert the removed element elsewhere first).
- change modes of `SetAttributeValueCmd` for attribute names the scripts do not set.
- `SetElementValueCmd.getChangeMode` for `NewVersion`/`OldVersion` (Revision elements).
- the removal of dead handlers in `WeakEventSource` (JS holds handlers strongly).
