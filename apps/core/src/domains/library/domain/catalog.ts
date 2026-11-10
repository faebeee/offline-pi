// The books the Library screen offers for download (formerly zims.txt in
// the knowledge container). Nothing is downloaded until the user selects it;
// any other Kiwix name can be added on the screen too.
//
// key: the ZIM file name WITHOUT the date suffix and ".zim", exactly as on
// https://download.kiwix.org/zim/ (wikipedia_en_medicine_maxi_2026-10.zim ->
// wikipedia_en_medicine_maxi). Many topics come in flavours: _maxi (with
// images), _nopic, _mini (intro only).
// size: approximate, in bytes (Kiwix catalog of 2026-11).

export interface CatalogItem {
  key: string;
  title: string;
  description: string;
  size: number;
  /** ISO 639-3 */
  language: string;
}

export interface CatalogGroup {
  id: string;
  label: string;
  items: CatalogItem[];
}

const MB = 1024 ** 2;
const GB = 1024 ** 3;

export const CATALOG: CatalogGroup[] = [
  {
    id: 'medical',
    label: 'Medical / First aid',
    items: [
      { key: 'wikipedia_en_medicine_maxi', title: 'WikiMed', description: "Wikipedia's medical articles, with images.", size: 1.8 * GB, language: 'eng' },
      { key: 'irp.fas.org_en_military-medicine', title: 'Military medicine', description: 'Field medicine manuals (FAS).', size: 60 * MB, language: 'eng' },
      { key: 'nhs.uk_en_medicines', title: 'NHS Medicines A-Z', description: 'What common medicines are for and how to take them.', size: 15 * MB, language: 'eng' },
      { key: 'medlineplus.gov_en_all', title: 'MedlinePlus', description: 'Health topics, drugs and a medical encyclopedia (NIH).', size: 1.9 * GB, language: 'eng' },
      { key: 'wwwnc.cdc.gov_en_all', title: "CDC Travelers' Health", description: 'Diseases, vaccines and health risks by destination.', size: 170 * MB, language: 'eng' },
    ],
  },
  {
    id: 'food',
    label: 'Food & Water',
    items: [
      { key: 'foss.cooking_en_all', title: 'FOSS Cooking', description: 'Free recipe collection.', size: 30 * MB, language: 'eng' },
      { key: 'publicdomainrecipes.com_en_all', title: 'Public Domain Recipes', description: 'Community recipes.', size: 16 * MB, language: 'eng' },
      { key: 'based.cooking_en_all', title: 'Based Cooking', description: 'Simple recipes without the clutter.', size: 15 * MB, language: 'eng' },
    ],
  },
  {
    id: 'repair',
    label: 'Shelter / Repair / Off-grid',
    items: [
      { key: 'ifixit_en_all', title: 'iFixit', description: 'Repair guides for devices, vehicles and tools.', size: 3.4 * GB, language: 'eng' },
      { key: 'solar.lowtechmagazine.com_mul_all', title: 'Low-Tech Magazine', description: 'Low-tech and off-grid solutions.', size: 670 * MB, language: 'mul' },
      { key: '100r.co_en_all', title: 'Hundred Rabbits', description: 'Off-grid living and sailing.', size: 170 * MB, language: 'eng' },
      { key: 'cd3wdproject.org_en_all', title: 'CD3WD', description: 'Practical know-how for developing regions.', size: 550 * MB, language: 'eng' },
    ],
  },
  {
    id: 'survival',
    label: 'General survival',
    items: [
      { key: 'trueprepper.com_en_all', title: 'True Prepper', description: 'Preparedness guides.', size: 1.4 * GB, language: 'eng' },
      { key: 'ready.gov_en_all', title: 'Ready.gov', description: 'Emergency preparedness (US government).', size: 2.0 * GB, language: 'eng' },
      { key: 'rabbitwaves.ca_en_all', title: 'Rabbit Waves', description: 'Emergency radio and communication.', size: 70 * MB, language: 'eng' },
      { key: 'survivorlibrary.com_en_all', title: 'Survivor Library', description: 'Historic how-to books. Very large: only with plenty of room.', size: 210 * GB, language: 'eng' },
    ],
  },
  {
    id: 'reference',
    label: 'General reference',
    items: [
      { key: 'wikipedia_en-simple_all_nopic', title: 'Simple English Wikipedia', description: 'The whole Simple English Wikipedia, without images.', size: 1 * GB, language: 'eng' },
    ],
  },
];
