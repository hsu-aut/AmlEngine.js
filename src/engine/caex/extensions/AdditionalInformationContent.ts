// Port of Aml.Engine.CAEX.Extensions.AdditionalInformationContent (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import type { CAEXBasicObject } from '../CAEXBasicObject.js';

/**
 * Base class for serializable content stored in an AdditionalInformation element
 * (see AdditionalInformationExtension.serializedAdditionalInformation).
 */
export abstract class AdditionalInformationContent {
  /** The CAEX object owning the AdditionalInformation element ([XmlIgnore]). */
  caexObject: CAEXBasicObject | null = null;
}

T.AdditionalInformationContent = AdditionalInformationContent;
