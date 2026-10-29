// Selected ENSIP-15 reference vectors, pinned to ens-normalize v1.11.1
// (Unicode 17.0.0), plus specification-derived boundary cases.
// https://github.com/adraffy/ens-normalize.js/blob/v1.11.1/validate/tests.json
// https://docs.ens.domains/ensip/15/
// Bare labels in the reference vectors receive the parser's default `.eth`.
// Expected outputs are fixed data, never computed with the implementation.
// This covers rule families, not every Unicode character or emoji permutation.

export const PRESERVED_REFERENCE_NAMES = [
  ['Trivial Digit Name', '123.eth', '123.eth'],
  ['Precomposed Latin IDN', 'öbb.at', 'öbb.at'],
  ['Uppercase Latin IDN', 'Öbb.at', 'öbb.at'],
  ['Sharp s remains distinct from ss', 'ß.eth', 'ß.eth'],
  ['Final sigma remains distinct from sigma', 'ς.eth', 'ς.eth'],
  [
    'Currency symbols',
    '$¢£¤¥₡₦₩₪₫€₭₮₱₲₴₵₸₹₺₼₽₾⃀₿ξ.؋',
    '$¢£¤¥₡₦₩₪₫€₭₮₱₲₴₵₸₹₺₼₽₾⃀₿ξ.؋',
  ],
  [
    'Exemplars: Latn',
    'àáâãāäåăąćĉčçèéêẽēëěęğìíîïǐǹńñòóôõöǒōšśşùúûüǔūýỳžźż.eth',
    'àáâãāäåăąćĉčçèéêẽēëěęğìíîïǐǹńñòóôõöǒōšśşùúûüǔūýỳžźż.eth',
  ],
  ['Exemplars: Grek', 'άέήίϊΐϋόύΰώ.eth', 'άέήίϊΐϋόύΰώ.eth'],
  ['Exemplars: Cyrl', 'ѓёӣйїќўӯ.eth', 'ѓёӣйїќўӯ.eth'],
  [
    'Exemplars: Kata',
    'ガギグゲゴザジズゼゾダヂヅデドバパビピブプベペボポヴヷヸヹヺヾ.eth',
    'ガギグゲゴザジズゼゾダヂヅデドバパビピブプベペボポヴヷヸヹヺヾ.eth',
  ],
  [
    'Exemplars: Hira',
    'がぎぐげござじずぜぞだぢづでどばぱびぴぶぷべぺぼぽゔゞ.eth',
    'がぎぐげござじずぜぞだぢづでどばぱびぴぶぷべぺぼぽゔゞ.eth',
  ],
  ['NSM: at max', 'إ\u0610\u0611\u0612.eth', 'إ\u0610\u0611\u0612.eth'],
  ['Double regional indicator: valid flag sequence', '🇺🇸.eth', '🇺🇸.eth'],
  ['CheckHyphens, Section 4.1 Rule #2 (Unicode)', 'xn--💩.eth', 'xn--💩.eth'],
  ['CheckHyphens, Section 4.1 Rule #3A (Ignored)', 'test-.eth', 'test-.eth'],
  ['CheckHyphens, Section 4.1 Rule #3B (Ignored)', '-test.eth', '-test.eth'],
  ['Hyphen: multiple', 't-e--s---t.eth', 't-e--s---t.eth'],
  ['Emoji + Text', '🌈rainbow.eth', '🌈rainbow.eth'],
  ['Text + Emoji', 'rainbow🌈.eth', 'rainbow🌈.eth'],
  [
    'Whole-confusable candidates with incompatible alternatives remain valid',
    'тӕ.eth',
    'тӕ.eth',
  ],
  [
    'ASCII counterpart of the Cyrillic whole-script confusable',
    '0x.eth',
    '0x.eth',
  ],
  ['Han permits ASCII letters and digits', '黑a8.eth', '黑a8.eth'],
  [
    'Japanese grouping permits prolonged sound mark, Han and ASCII',
    'ー一a.eth',
    'ー一a.eth',
  ],
  ['Whitelisted copyright emoji', '©.eth', '©.eth'],
  ['Skin-tone modifier sequence', '👍🏽.eth', '👍🏽.eth'],
  [
    'Longest emoji match with modifier and joiner',
    '👨🏻\u200d💻.eth',
    '👨🏻\u200d💻.eth',
  ],
  [
    'Valid England emoji tag sequence',
    '🏴\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f.eth',
    '🏴\udb40\udc67\udb40\udc62\udb40\udc65\udb40\udc6e\udb40\udc67\udb40\udc7f.eth',
  ],
  ['Restricted Egyptian script can mix with emoji', '𓆏🐸.eth', '𓆏🐸.eth'],
  [
    'Script groups are checked per label',
    'alice.ελληνικά.eth',
    'alice.ελληνικά.eth',
  ],
  ['Korean permits ASCII letters', '한글abc.eth', '한글abc.eth'],
  ['Unicode case folding is not a rewrite', 'Kelvin.eth', 'kelvin.eth'],
  [
    'Unicode whitespace is trimmed at the input boundary',
    '\u00a0ALICE.ETH\u2003',
    'alice.eth',
  ],
  [
    'Label length is not limited to DNS 63-byte labels',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.eth',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.eth',
  ],
] as const

export const REWRITTEN_REFERENCE_NAMES = [
  ['Mapping: roman numeral', 'Ⅷ.eth', 'viii.eth'],
  ['Mapping: demoji', 'Ⓜ\ufe0f.eth', 'm.eth'],
  ['Apostrophe', "a'a’a.eth", 'a’a’a.eth'],
  ['Ignored: emoji-styling', '\ufe0e\ufe0fa.eth', 'a.eth'],
  [
    'Emoji: Keycaps',
    '0\ufe0f\u20e31\ufe0f\u20e32\ufe0f\u20e33\ufe0f\u20e34\ufe0f\u20e35\ufe0f\u20e36\ufe0f\u20e37\ufe0f\u20e38\ufe0f\u20e39\ufe0f\u20e3.eth',
    '0\u20e31\u20e32\u20e33\u20e34\u20e35\u20e36\u20e37\u20e38\u20e39\u20e3.eth',
  ],
  ['Hyphens', 'hyphens-‐‑‒–—―⁃−⎯⏤﹘.eth', 'hyphens------------.eth'],
  ['Emoji: All Styles', '💩💩\ufe0e💩\ufe0f.eth', '💩💩💩.eth'],
  ['Arabic Mapping', '۰۱۲۳۸۹.eth', '٠١٢٣٨٩.eth'],
  [
    'Vulgar fraction expansion introduces an interior fenced character',
    '½.eth',
    '1⁄2.eth',
  ],
  ['Japanese here emoji maps to Katakana text', '🈁.eth', 'ココ.eth'],
  ['Compatibility ligature expansion', 'ﬃ.eth', 'ffi.eth'],
  ['Hangul Jamo NFC composition', '한.eth', '한.eth'],
  ['Double and triple hyphen expansion', 'a⸺b⸻c.eth', 'a--b---c.eth'],
  ['Superscript digit mapping', 'x².eth', 'x2.eth'],
  ['Normalization applies to Unicode TLDs', 'alice.cafe\u0301', 'alice.café'],
] as const

export const REJECTED_REFERENCE_NAMES = [
  ['IDNATestV2', '◌\u0308bb.at', 'INVALID_NAME'],
  ['negative circled (11-20,0)', '⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴⓿.eth', 'INVALID_NAME'],
  ['double circled (1-10)', '⓵⓶⓷⓸⓹⓺⓻⓼⓽⓾.eth', 'INVALID_NAME'],
  ['ZWJ: trailing', 'test\u200d.eth', 'INVALID_NAME'],
  ['ZWJ: leading', '\u200dtest.eth', 'INVALID_NAME'],
  ['Apostrophe: leading', "'a.eth", 'INVALID_NAME'],
  ['Apostrophe: trailing', 'a’.eth', 'INVALID_NAME'],
  ['Apostrophe: adjacent', "a'’a.eth", 'INVALID_NAME'],
  ['ContextO: middle dot', 'l·l.eth', 'INVALID_NAME'],
  ['Emoji + CM', '💩\u0303.eth', 'INVALID_NAME'],
  ['Whitelisted CM: disallowed char', 'àáâãāäåăǖ.eth', 'INVALID_NAME'],
  [
    'Whitelisted CM: illegal mixture',
    'àáâãa\u0303\u0303āäåă.eth',
    'INVALID_NAME',
  ],
  ['Arabic NSM: repeated w/NFD expansion', 'آ\u064d\u064d.eth', 'INVALID_NAME'],
  [
    'Devanagari NSM: repeated w/NFD expansion',
    'ऩ\u0900\u0900.eth',
    'INVALID_NAME',
  ],
  ['NSM: too many (5/4)', 'إ\u0610\u0611\u0612\u0613.eth', 'INVALID_NAME'],
  ['Single regional indicator', '🇦.eth', 'INVALID_NAME'],
  [
    'Double regional indicator: invalid flag sequence',
    '🇦🇦.eth',
    'INVALID_NAME',
  ],
  [
    'Text-styled Modifier Sequence in ZWJ Sequence',
    '👩\ufe0e🏽\u200d⚕\ufe0f.eth',
    'INVALID_NAME',
  ],
  ['Text-styled Emoji in ZWJ Sequence', '🏳\ufe0e\u200d🌈.eth', 'INVALID_NAME'],
  [
    'Invalid Emoji Tag Sequence',
    '🏴\udb40\udc77\udb40\udc74\udb40\udc66\udb40\udc7f.eth',
    'INVALID_NAME',
  ],
  ['Restricted Cherokee whole-script confusable', 'ᎫᏦᎥ.eth', 'INVALID_NAME'],
  ['Entire Cyrillic label confusable with Latin', 'аррӏе.eth', 'INVALID_NAME'],
  [
    'Cyrillic whole-script confusable mixed with an ASCII digit',
    '0х.eth',
    'INVALID_NAME',
  ],
  [
    'Dollar sign is not a script-mixing exemption for Arabic digits',
    '$٠٠٩٩.eth',
    'INVALID_NAME',
  ],
  ['Bengali whole-script confusable with Latin', '৭৭৭৭৭৭.eth', 'INVALID_NAME'],
  ['Hebrew whole-script confusable with Latin', 'טסס.eth', 'INVALID_NAME'],
  ['An isolated skin-tone modifier', '🏽.eth', 'INVALID_NAME'],
  ['Disabled double-exclamation emoji', '‼.eth', 'INVALID_NAME'],
  ['Disabled exclamation-question emoji', '⁉.eth', 'INVALID_NAME'],
  [
    'Greek and Latin cannot mix in one label',
    'aliceελληνικά.eth',
    'INVALID_NAME',
  ],
  [
    'Restricted scripts cannot mix with ASCII letters',
    '𓆏abc.eth',
    'INVALID_NAME',
  ],
  ['Private-use codepoint', 'alice\ue000.eth', 'INVALID_NAME'],
  ['Unassigned codepoint', 'alice\u0378.eth', 'INVALID_NAME'],
  ['BMP noncharacter', 'alice\uffff.eth', 'INVALID_NAME'],
  ['Supplementary noncharacter', 'alice\ud83f\udffe.eth', 'INVALID_NAME'],
  ['Unpaired high surrogate', 'alice\ud800.eth', 'INVALID_NAME'],
  ['Unpaired low surrogate', 'alice\udc00.eth', 'INVALID_NAME'],
  ['C1 control', 'alice\u0085.eth', 'INVALID_NAME'],
  [
    'Combining grapheme joiner is disallowed in v1.11.1',
    'al\u034fice.eth',
    'INVALID_NAME',
  ],
  ['A label made only of ignored characters', '\ufe0f.eth', 'INVALID_NAME'],
  ['Non-breaking space inside a label', 'ali\u00a0ce.eth', 'SPACE_NOT_ALLOWED'],
  ['Em space inside a label', 'ali\u2003ce.eth', 'SPACE_NOT_ALLOWED'],
  ['Line separator inside a label', 'ali\u2028ce.eth', 'SPACE_NOT_ALLOWED'],
  // Parser format errors are distinct from ENSIP-15 label-validation errors.
  ['An empty input', '', 'LABEL_NOT_FOUND'],
  ['Whitespace without a label', '\u00a0\t ', 'LABEL_NOT_FOUND'],
  ['An empty interior label', 'alice..eth', 'MULTIPLE_CONSECUTIVE_DOTS'],
] as const
