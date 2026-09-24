// Port of Aml.Engine.CAEX.Linq.CAEXSequenceExtension (Aml.Engine 4.5.2).

import { from, type Enumerable } from '../../../system/linq.js';
import { InheritanceExtensions } from '../extensions/InheritanceExtensions.js';
import type { ExternalInterfaceSequence } from '../ExternalInterfaceSequence.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { InterfaceFamilyType } from '../InterfaceFamilyType.js';
import type { CAEXSequence } from '../CAEXSequence.js';
import type { RoleRequirementsType } from '../RoleRequirementsType.js';
import type { SupportedRoleClassType } from '../SupportedRoleClassType.js';
import type { RoleFamilyType } from '../RoleFamilyType.js';

/** LINQ style extensions for CAEX sequences. */
export class CAEXSequenceExtension {
  private constructor() {}

  /** Gets the external interfaces of the sequence whose interface class is derived from the given class. */
  static ofInterfaceClass(sequence: ExternalInterfaceSequence, interfaceClass: InterfaceFamilyType | null): Enumerable<ExternalInterfaceType> {
    return from<ExternalInterfaceType>(sequence).where((s) => {
      const ic = s.interfaceClass;
      return (ic != null ? InheritanceExtensions.classIsDerivedFrom(ic, interfaceClass) : null) === true;
    });
  }

  /**
   * Gets the role requirements (or supported role classes) of the sequence whose role class is
   * derived from the given class. (Two C# overloads with the same body.)
   */
  static ofRoleClass(sequence: CAEXSequence<RoleRequirementsType>, roleClass: RoleFamilyType | null): Enumerable<RoleRequirementsType>;
  static ofRoleClass(sequence: CAEXSequence<SupportedRoleClassType>, roleClass: RoleFamilyType | null): Enumerable<SupportedRoleClassType>;
  static ofRoleClass(
    sequence: Iterable<RoleRequirementsType | SupportedRoleClassType>,
    roleClass: RoleFamilyType | null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Enumerable<any> {
    return from<RoleRequirementsType | SupportedRoleClassType>(sequence).where(
      (s) => InheritanceExtensions.classIsDerivedFrom(s.roleClass!, roleClass) === true,
    );
  }
}
