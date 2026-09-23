// Frozen before provider calls. Invented facts; this tests review, not workers.
const source = 'For the fictional Juniper archive trial, Noor owns the inventory audit. The audit is pending. Eli owns the label design. The ventilation check has no assigned owner.';
const prompt = 'Write a concise handoff using only the supplied assignments and status. Do not invent or transfer ownership.';
const fields = [
  ['Title', 'Juniper storage card'], ['Site', 'North annex'], ['Room', 'Birch'],
  ['Cabinet', 'C4'], ['Shelf', 'B2'], ['Box count', '6'], ['Folder count', '24'],
  ['Label color', 'Blue'], ['Access status', 'Pending'], ['Review date', 'October 22, 2026'],
  ['Pack type', 'Flat'], ['Seal color', 'White'], ['Transfer status', 'Not approved'],
  ['Retention code', 'R7'],
];
const card = fields.map(([k,v]) => `${k}: ${v}`).join('\n');
const numbered = fields.map(([k,v],i) => `${i+1}. State ${k} as "${v}"`).join('; ');
export const probes = [
  { id:'owner-supported-status', expected:'passed', source, prompt,
    expectedResult:'State Noor owns the pending inventory audit without inventing another assignment',
    text:'- **Inventory audit:** Pending; owner: Noor.' },
  { id:'owner-supported-dash', expected:'passed', source, prompt,
    expectedResult:'State the pending inventory audit is assigned to Noor',
    text:'- Inventory audit — Owner: Noor. Status: pending.' },
  { id:'owner-cross-item', expected:'failed', source, prompt,
    expectedResult:'State the inventory audit owner accurately without transferring label-design ownership',
    text:'- Inventory audit: Pending; owner: Eli.' },
  { id:'owner-invented', expected:'failed', source, prompt,
    expectedResult:'State the ventilation check owner accurately; preserve unassigned status',
    text:'- Ventilation check — Owner: Noor.' },
  { id:'owner-missing-source', expected:'unverified', source:'', prompt,
    expectedResult:'State the inventory audit owner accurately', text:'- Inventory audit — Owner: Noor.', missing:true },
  { id:'numbered-supported', expected:'passed', source:'Fictional approved reference card:\n'+card,
    prompt:'Copy the fourteen fields exactly from the reference into card.txt, one field per line. Do not add facts.',
    expectedResult:numbered,text:card },
  { id:'numbered-last-wrong', expected:'failed', source:'Fictional approved reference card:\n'+card,
    prompt:'Copy the fourteen fields exactly from the reference into card.txt, one field per line. Do not add facts.',
    expectedResult:numbered,text:card.replace('Retention code: R7','Retention code: R9') },
] as const;

// Second, separately frozen diagnostic: scope ambiguity in the first pair is
// a hypothesis, not an established judge defect. Original results stay intact.
const scopedSource = 'For the fictional Dune materials library, Remy owns the catalog audit. The audit is pending. Aya owns shelf-label design. Label design is pending.';
export const scopeProbes = [
  { id:'single-item-supported', expected:'passed', source:scopedSource,
    prompt:'Write exactly one handoff line about the catalog audit only, naming its owner and status. Do not include shelf-label design or other work. The one line is the entire requested deliverable.',
    expectedResult:'One line identifying Remy as catalog audit owner and the audit as pending',
    text:'Catalog audit — Owner: Remy. Status: pending.' },
  { id:'single-item-wrong-owner', expected:'failed', source:scopedSource,
    prompt:'Write exactly one handoff line about the catalog audit only, naming its owner and status. Do not include shelf-label design or other work. The one line is the entire requested deliverable.',
    expectedResult:'One line identifying the catalog audit owner and status accurately',
    text:'Catalog audit — Owner: Aya. Status: pending.' },
] as const;
