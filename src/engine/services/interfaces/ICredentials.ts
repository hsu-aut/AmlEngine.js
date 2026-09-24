// Port of Aml.Engine.Services.Interfaces.ICredentials (Aml.Engine 4.5.2).

/** User credentials. */
export interface ICredentials {
  userName: string | null;
  password: string | null;
  readonly isAnonymous: boolean;
}
