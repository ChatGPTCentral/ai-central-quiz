'use client'

import { useMemo, useState } from 'react'
import { ComposableMap, Geographies, Geography } from 'react-simple-maps'
import { scaleSqrt } from 'd3-scale'
import { NAME_TO_CODE } from '@/lib/country-flags'
import { PALETTE } from '@/lib/palette'

// world-atlas ships a 110m world topology with ISO numeric codes in `id`.
// We need to map our country labels (free-text "United States", "UK", etc.)
// to that ISO numeric, going via the alpha-2 code in NAME_TO_CODE.

import worldData from 'world-atlas/countries-110m.json'

// ISO alpha-2 → ISO numeric (3-digit string). Covers every country in
// world-atlas's topology. Built from the official ISO 3166-1 list.
const A2_TO_NUMERIC: Record<string, string> = {
  AD:'020',AE:'784',AF:'004',AG:'028',AI:'660',AL:'008',AM:'051',AO:'024',AQ:'010',AR:'032',AS:'016',AT:'040',AU:'036',AW:'533',AX:'248',AZ:'031',
  BA:'070',BB:'052',BD:'050',BE:'056',BF:'854',BG:'100',BH:'048',BI:'108',BJ:'204',BL:'652',BM:'060',BN:'096',BO:'068',BQ:'535',BR:'076',BS:'044',BT:'064',BV:'074',BW:'072',BY:'112',BZ:'084',
  CA:'124',CC:'166',CD:'180',CF:'140',CG:'178',CH:'756',CI:'384',CK:'184',CL:'152',CM:'120',CN:'156',CO:'170',CR:'188',CU:'192',CV:'132',CW:'531',CX:'162',CY:'196',CZ:'203',
  DE:'276',DJ:'262',DK:'208',DM:'212',DO:'214',DZ:'012',
  EC:'218',EE:'233',EG:'818',EH:'732',ER:'232',ES:'724',ET:'231',
  FI:'246',FJ:'242',FK:'238',FM:'583',FO:'234',FR:'250',
  GA:'266',GB:'826',GD:'308',GE:'268',GF:'254',GG:'831',GH:'288',GI:'292',GL:'304',GM:'270',GN:'324',GP:'312',GQ:'226',GR:'300',GS:'239',GT:'320',GU:'316',GW:'624',GY:'328',
  HK:'344',HM:'334',HN:'340',HR:'191',HT:'332',HU:'348',
  ID:'360',IE:'372',IL:'376',IM:'833',IN:'356',IO:'086',IQ:'368',IR:'364',IS:'352',IT:'380',
  JE:'832',JM:'388',JO:'400',JP:'392',
  KE:'404',KG:'417',KH:'116',KI:'296',KM:'174',KN:'659',KP:'408',KR:'410',KW:'414',KY:'136',KZ:'398',
  LA:'418',LB:'422',LC:'662',LI:'438',LK:'144',LR:'430',LS:'426',LT:'440',LU:'442',LV:'428',LY:'434',
  MA:'504',MC:'492',MD:'498',ME:'499',MF:'663',MG:'450',MH:'584',MK:'807',ML:'466',MM:'104',MN:'496',MO:'446',MP:'580',MQ:'474',MR:'478',MS:'500',MT:'470',MU:'480',MV:'462',MW:'454',MX:'484',MY:'458',MZ:'508',
  NA:'516',NC:'540',NE:'562',NF:'574',NG:'566',NI:'558',NL:'528',NO:'578',NP:'524',NR:'520',NU:'570',NZ:'554',
  OM:'512',
  PA:'591',PE:'604',PF:'258',PG:'598',PH:'608',PK:'586',PL:'616',PM:'666',PN:'612',PR:'630',PS:'275',PT:'620',PW:'585',PY:'600',
  QA:'634',
  RE:'638',RO:'642',RS:'688',RU:'643',RW:'646',
  SA:'682',SB:'090',SC:'690',SD:'729',SE:'752',SG:'702',SH:'654',SI:'705',SJ:'744',SK:'703',SL:'694',SM:'674',SN:'686',SO:'706',SR:'740',SS:'728',ST:'678',SV:'222',SX:'534',SY:'760',SZ:'748',
  TC:'796',TD:'148',TF:'260',TG:'768',TH:'764',TJ:'762',TK:'772',TL:'626',TM:'795',TN:'788',TO:'776',TR:'792',TT:'780',TV:'798',TW:'158',TZ:'834',
  UA:'804',UG:'800',UM:'581',US:'840',UY:'858',UZ:'860',
  VA:'336',VC:'670',VE:'862',VG:'092',VI:'850',VN:'704',VU:'548',
  WF:'876',WS:'882',
  YE:'887',YT:'175',
  ZA:'710',ZM:'894',ZW:'716',
}

interface Props {
  /** Each row: country name (free-text). Same shape consumed by CountryChart. */
  rows: { country?: string | null }[]
}

/**
 * Choropleth world map. Each country is shaded according to how many rows
 * are tagged with it. Hover shows country + count.
 */
export default function WorldMap({ rows }: Props) {
  const [hovered, setHovered] = useState<{ name: string; count: number } | null>(null)

  // Build a map of ISO-numeric → count
  const { counts, max, total } = useMemo(() => {
    const c = new Map<string, { count: number; name: string }>()
    for (const r of rows) {
      if (!r.country) continue
      const name = r.country.trim()
      const a2 = NAME_TO_CODE[name] || NAME_TO_CODE[name.replace(/[.,]$/, '')]
      if (!a2) continue
      const numeric = A2_TO_NUMERIC[a2]
      if (!numeric) continue
      const prev = c.get(numeric)
      c.set(numeric, { count: (prev?.count || 0) + 1, name })
    }
    const max = Math.max(...Array.from(c.values()).map(v => v.count), 1)
    const total = Array.from(c.values()).reduce((a, b) => a + b.count, 0)
    return { counts: c, max, total }
  }, [rows])

  // Sqrt scale flattens the long tail (US dominates) so smaller countries are still visible
  const colorScale = scaleSqrt<string>()
    .domain([0, max])
    .range(['#F5F0E8', PALETTE.azul])

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="text-[11px] text-[#9C9C9C]">
          {counts.size} {counts.size === 1 ? 'country' : 'countries'} · {total.toLocaleString()} records mapped
        </p>
        {hovered && (
          <p className="text-[11px] font-bold text-[#333333]">
            {hovered.name} · {hovered.count}
          </p>
        )}
      </div>
      <div className="flex-1 overflow-hidden rounded-lg bg-[#FFFDFA] border border-[#E8E4DF]">
        <ComposableMap
          projectionConfig={{ scale: 145 }}
          width={900}
          height={460}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={worldData as unknown as object}>
            {({ geographies }: { geographies: Array<{ rsmKey: string; properties: { name: string }; id: string }> }) =>
              geographies.map(geo => {
                const entry = counts.get(geo.id)
                const fill = entry ? colorScale(entry.count) : '#F0EAE0'
                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fill}
                    stroke="#E8E4DF"
                    strokeWidth={0.5}
                    onMouseEnter={() => setHovered(entry ? { name: entry.name, count: entry.count } : { name: geo.properties.name, count: 0 })}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      default: { outline: 'none' },
                      hover:   { fill: PALETTE.fulvous, outline: 'none', cursor: 'pointer' },
                      pressed: { outline: 'none' },
                    }}
                  />
                )
              })
            }
          </Geographies>
        </ComposableMap>
      </div>
      {/* Legend */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-[#9C9C9C] tabular-nums">
        <span>0</span>
        <div className="flex-1 h-2 rounded" style={{
          background: `linear-gradient(to right, #F5F0E8, ${PALETTE.azul})`,
        }} />
        <span>{max}</span>
      </div>
    </div>
  )
}
