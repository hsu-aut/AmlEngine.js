// Port of Aml.Engine.Services.Interfaces.ISuspendable (Aml.Engine 4.5.2).

/** A service which can be suspended and resumed. */
export interface ISuspendable {
  suspend(): void;
  resume(): void;
}
