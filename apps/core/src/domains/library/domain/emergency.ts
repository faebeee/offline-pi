// The Library's "In an emergency" index: the topics that matter first when
// something happens, each a full-text search in the installed books whose
// best hit opens directly. English terms, matched against the titles of
// WikiMed / Wikipedia articles where possible (most curated books are
// English); a topic without a hit just leads to the search.
//
// STARTER_SET: the books the index needs, offered as one tick on the
// "Choose books" screen (keys from domain/catalog.ts, about 2.4 GB).

export interface EmergencyTopicDef {
  id: string;
  label: string;
  /** the full-text search that finds its article */
  query: string;
}

export interface EmergencyGroupDef {
  id: string;
  label: string;
  topics: EmergencyTopicDef[];
}

export const EMERGENCY: EmergencyGroupDef[] = [
  {
    id: 'urgent',
    label: 'Act now',
    topics: [
      { id: 'cpr', label: 'CPR', query: 'Cardiopulmonary resuscitation' },
      { id: 'bleeding', label: 'Severe bleeding', query: 'Bleeding' },
      { id: 'choking', label: 'Choking', query: 'Choking' },
      { id: 'shock', label: 'Shock', query: 'Circulatory shock' },
      { id: 'anaphylaxis', label: 'Allergic reaction', query: 'Anaphylaxis' },
      { id: 'heart-attack', label: 'Heart attack', query: 'Myocardial infarction' },
      { id: 'stroke', label: 'Stroke', query: 'Stroke' },
    ],
  },
  {
    id: 'injuries',
    label: 'Injuries and exposure',
    topics: [
      { id: 'burns', label: 'Burns', query: 'Burn' },
      { id: 'fracture', label: 'Broken bones', query: 'Bone fracture' },
      { id: 'head-injury', label: 'Head injury', query: 'Head injury' },
      { id: 'wounds', label: 'Wounds', query: 'Wound' },
      { id: 'hypothermia', label: 'Hypothermia', query: 'Hypothermia' },
      { id: 'frostbite', label: 'Frostbite', query: 'Frostbite' },
      { id: 'heat-stroke', label: 'Heat stroke', query: 'Heat stroke' },
      { id: 'co', label: 'Carbon monoxide', query: 'Carbon monoxide poisoning' },
      { id: 'poisoning', label: 'Poisoning', query: 'Poisoning' },
    ],
  },
  {
    id: 'illness',
    label: 'Illness',
    topics: [
      { id: 'dehydration', label: 'Dehydration', query: 'Dehydration' },
      { id: 'ors', label: 'Oral rehydration', query: 'Oral rehydration therapy' },
      { id: 'diarrhea', label: 'Diarrhoea', query: 'Diarrhea' },
      { id: 'fever', label: 'Fever', query: 'Fever' },
    ],
  },
  {
    id: 'living',
    label: 'Water, food and hygiene',
    topics: [
      { id: 'water', label: 'Water purification', query: 'Water purification' },
      { id: 'food', label: 'Food preservation', query: 'Food preservation' },
      { id: 'sanitation', label: 'Sanitation', query: 'Sanitation' },
      { id: 'hand-washing', label: 'Hand washing', query: 'Hand washing' },
    ],
  },
];

export const STARTER_SET = [
  'wikipedia_en_medicine_maxi',
  'irp.fas.org_en_military-medicine',
  'nhs.uk_en_medicines',
  'cd3wdproject.org_en_all',
];
