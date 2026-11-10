// Port of Aml.Engine.Resources.Catalogue.StringComparisonAlgorithmEnum (Aml.Engine.Resources 4.2.1).

/** Kinds of matching algorithms for similarity search. */
export enum StringComparisonAlgorithmEnum {
  /** String comparison using the Levensthein distance string metric. */
  Levensthein = 0,
  /** String comparisons on phonemes (the sound of the string). */
  PhoneticFuzzy = 1,
  /** String comparisons based on character comparison. */
  CharacterComparison = 2,
}
