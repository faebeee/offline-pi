// Outpost illustrations (DESIGN.md changelog 0.6): line art in the icon
// style (square caps, thin strokes, no fills but the ground colour), drawn
// by tokens through classes in illustrations.css, so both themes work.
// Animated parts are CSS only and stop with reduced motion / motion-off.
//
//   illustration("hero")   -> SVG markup (string), decorative (aria-hidden)
//   ILLUSTRATIONS          -> the names
//
// Stroke classes: l (line2, far), f (fg2/fg3, near), a (amber: own post,
// route), i (info), o (ok), c (crit); g = filled with the ground colour
// (hides what is behind). Motion: pulse, blink, march, draw (pathLength=1),
// scan, float, flicker, spin, type.

const svg = (viewBox, body, cls = "") =>
  `<svg class="il ${cls}" viewBox="${viewBox}" aria-hidden="true" focusable="false">${body}</svg>`;

// signal arcs around (x, y), r = radii, class extra
const arcs = (x, y, radii, cls = "a") =>
  radii
    .map(
      (r, n) =>
        `<path class="${cls} pulse" style="animation-delay:${n * 0.45}s" d="M${x - r * 0.7} ${y - r * 0.7}A${r} ${r} 0 0 0 ${x - r * 0.7} ${y + r * 0.7}M${x + r * 0.7} ${y - r * 0.7}A${r} ${r} 0 0 1 ${x + r * 0.7} ${y + r * 0.7}"/>`,
    )
    .join("");

const HERO = svg(
  "0 0 960 220",
  `
  <path class="l faint" d="M0 40H960M0 80H960"/>
  <!-- outer ruins, beyond the frame on a phone -->
  <path class="l g" d="M0 192V120H22V104H30V120H44V192"/>
  <path class="l g" d="M54 192V150H70L76 138L84 150V192"/>
  <path class="l g" d="M100 192V96H112L118 86L124 98V192"/>
  <path class="l" d="M104 108h4M104 120h4M104 132h4M104 144h4M4 132h4M4 146h4M30 132h4"/>
  <path class="l g" d="M800 192V140H818V112H830L836 102L840 114V192"/>
  <path class="l g" d="M852 192V158H872V128L880 122L888 132V192"/>
  <path class="l g" d="M900 192V100H922V86H930V100H944V192"/>
  <path class="l" d="M906 112h4M906 124h4M906 136h4M906 148h4M926 112h4M926 136h4M820 124h4M820 136h4"/>
  <g transform="translate(160 0)">
  <!-- the sun going down behind the ruins -->
  <g class="a sun">
    <circle cx="470" cy="128" r="66"/>
    <path d="M405 140H535M408 152H532M413 163H527M420 172H520M429 180H511M442 187H498"/>
  </g>
  <!-- far ruins -->
  <path class="l g" d="M0 192V160H14V142H26V160H38V126H46L50 118L54 130V160H64V100L74 92L84 100V146L90 152V192"/>
  <path class="l g" d="M96 192V146H120V132H128V146H140V170H158V192"/>
  <path class="l g" d="M330 192V150H346V130H358V112L366 104L372 116V150H384V192"/>
  <!-- near ruins in front of the sun: a broken tower, a leaning block -->
  <path class="f g" d="M392 192V118H404V96L410 92L414 100L420 98V124L426 120V192"/>
  <path class="f g" d="M436 192L444 104L470 108L466 132L476 138L470 192"/>
  <path class="f g" d="M486 192V146H500V128H516V146L524 152V192"/>
  <path class="f g" d="M540 192V84H556L560 76L566 90H572V192"/>
  <path class="f g" d="M584 192V138H604L610 130L616 140V192"/>
  <g class="l">
    <path d="M396 128h4M396 138h4M396 148h4M396 158h4M406 108h4M406 128h4M406 148h4"/>
    <path d="M546 96h4M546 108h4M546 120h4M546 132h4M546 144h4M560 102h4M560 126h4M560 150h4"/>
    <path d="M446 118l14 2M444 130l14 2M448 152h10"/>
    <path d="M410 92l-8 -10M420 98l6 -8M566 90l6 -10" class="f"/>
  </g>
  <!-- the outpost: shelter, solar panel, mast -->
  <path class="f g" d="M176 192V168L198 160L220 168V192Z"/>
  <path class="f" d="M194 192V178H202V192"/>
  <path class="a" d="M182 156L210 146L214 152L186 162Z"/>
  <path class="a" d="M188 160L186 168M206 152L206 162"/>
  <path class="f" d="M256 192L248 92L240 192M243 160L253 140M245 136L251 116M252 172L244 150"/>
  <path class="f" d="M234 192H262"/>
  <circle class="af blink" cx="248" cy="88" r="2.5"/>
  ${arcs(248, 88, [10, 18, 26])}
  <!-- mesh nodes on the ruins, linked to the mast -->
  <path class="i march" d="M248 88L74 92M248 88L410 92M410 92L560 76"/>
  <rect class="i node" x="70.5" y="88.5" width="7" height="7" transform="rotate(45 74 92)"/>
  <rect class="i node" x="406.5" y="88.5" width="7" height="7" transform="rotate(45 410 92)"/>
  <rect class="i node" x="556.5" y="72.5" width="7" height="7" transform="rotate(45 560 76)"/>
  <!-- a drone holding position -->
  <g class="float">
    <path class="f" d="M300 52h16M304 52v-3h8v3M296 48h8M312 48h8M308 52v4"/>
    <circle class="cf blink" style="animation-delay:.6s" cx="308" cy="57" r="1.5"/>
  </g>
  <!-- drifting dust -->
  <g class="f dust">
    <circle class="float" cx="120" cy="120" r=".9"/>
    <circle class="float" style="animation-delay:1.2s" cx="300" cy="150" r=".9"/>
    <circle class="float" style="animation-delay:2.1s" cx="520" cy="60" r=".9"/>
    <circle class="float" style="animation-delay:.6s" cx="610" cy="110" r=".9"/>
    <circle class="float" style="animation-delay:1.7s" cx="30" cy="100" r=".9"/>
  </g>
    </g>
  <!-- horizon and terrain -->
  <path class="f" d="M0 192H960"/>
  <path class="l" d="M0 202C80 198 140 206 220 202S380 196 460 202S580 208 640 202S860 196 960 202"/>
  <path class="l" d="M0 212C90 208 170 216 260 211S420 206 500 212S600 216 640 212S880 208 960 212"/>
  <path class="i scan" style="--d:220px" d="M0 0H960"/>
  `,
  "il-hero",
);

const MAPS = svg(
  "0 0 200 120",
  `
  <path class="l" d="M0 30H200M0 60H200M0 90H200M50 0V120M100 0V120M150 0V120"/>
  <path class="f" d="M30 70C30 44 62 30 90 36S146 40 150 64S120 100 86 98S30 92 30 70Z"/>
  <path class="f" d="M48 70C48 54 70 46 90 50S130 54 132 66S110 86 88 84S48 82 48 70Z"/>
  <path class="l" d="M68 69C68 62 80 58 90 60S112 63 112 68S100 76 90 75S68 74 68 69Z"/>
  <path class="l" d="M10 108C40 100 60 112 100 106S170 96 196 104"/>
  <path class="a march" d="M40 104L70 84L96 92L130 52L164 40"/>
  <rect class="a" x="160" y="36" width="8" height="8" transform="rotate(45 164 40)"/>
  <path class="af" d="M40 98L45 110L40 107L35 110Z"/>
  <g class="i reticle">
    <circle cx="96" cy="66" r="12"/>
    <path d="M96 48V58M96 74V84M78 66H88M104 66H114"/>
  </g>
  `,
);

const LIBRARY = svg(
  "0 0 200 120",
  `
  <path class="l" d="M10 108H190"/>
  <path class="f g" d="M40 108V58H160V108Z"/>
  <path class="f" d="M40 70H160M40 96H160M44 58V108M156 58V108"/>
  <path class="l" d="M52 64v4M60 64v4M68 64v4M132 64v4M140 64v4M148 64v4"/>
  <g class="f">
    <path class="g" d="M54 96V76H62V96Z"/>
    <path class="g" d="M64 96V72H74V96Z"/>
    <path class="g" d="M76 96V78H82V96Z"/>
    <path class="g" d="M86 96L92 76L99 78L93 96Z"/>
    <path class="g" d="M104 96V74H114V96Z"/>
    <path class="g" d="M118 96V80H124V96Z"/>
    <path class="g" d="M128 96V76H142V96Z"/>
    <path class="l" d="M66 78h6M66 82h6M130 82h10M106 80h6"/>
  </g>
  <!-- an open book on the crate, its pages lit -->
  <path class="a" d="M70 54L100 48L130 54M100 48V30M70 54V36L100 30L130 36V54"/>
  <path class="l type" pathLength="1" d="M76 40L94 36M76 45L94 41M106 36L124 40M106 41L124 45"/>
  <!-- a data shard rising -->
  <g class="float">
    <path class="i g" d="M166 34L176 22L186 34L176 50Z"/>
    <path class="i flicker" d="M176 22V50M166 34H186"/>
  </g>
  `,
);

const MESH = svg(
  "0 0 200 120",
  `
  <path class="l" d="M0 104C40 98 70 108 110 102S170 96 200 100"/>
  <path class="f g" d="M78 108V44H112V108Z"/>
  <path class="f" d="M84 50H106V68H84Z"/>
  <path class="o" d="M88 56H98M88 61H102"/>
  <path class="f" d="M86 76H104M86 82H104M86 88H104M86 94H104"/>
  <path class="f" d="M104 44V16"/>
  <circle class="af blink" cx="104" cy="14" r="2.2"/>
  ${arcs(104, 14, [9, 16, 23], "o")}
  <path class="i march" d="M40 60L104 14L168 52"/>
  <rect class="i" x="36.5" y="56.5" width="7" height="7" transform="rotate(45 40 60)"/>
  <rect class="i" x="164.5" y="48.5" width="7" height="7" transform="rotate(45 168 52)"/>
  <path class="l" d="M40 66V100M168 58V98M32 100H48M160 98H176"/>
  `,
);

const SYSTEM = svg(
  "0 0 200 120",
  `
  <path class="f g" d="M30 96V24H170V96Z"/>
  <circle class="l" cx="38" cy="32" r="3"/><circle class="l" cx="162" cy="32" r="3"/>
  <circle class="l" cx="38" cy="88" r="3"/><circle class="l" cx="162" cy="88" r="3"/>
  <path class="l" d="M50 30h4M58 30h4M66 30h4M74 30h4M82 30h4M90 30h4M98 30h4M106 30h4M114 30h4M122 30h4M130 30h4M138 30h4"/>
  <path class="f g" d="M78 46H112V76H78Z"/>
  <path class="l" d="M84 46V40M92 46V40M100 46V40M106 46V40M84 76V82M92 76V82M100 76V82M106 76V82M78 52H72M78 60H72M78 68H72M112 52H118M112 60H118M112 68H118"/>
  <path class="f" d="M128 52H160V72H128Z"/>
  <g class="f spin" style="transform-origin:144px 62px">
    <path d="M144 62L144 54M144 62L151 66M144 62L137 66"/>
  </g>
  <path class="o draw loop" pathLength="1" d="M36 108H62L68 98L74 116L80 104H96L102 100L108 108H164"/>
  `,
);

const LOGS = svg(
  "0 0 200 120",
  `
  <path class="f g" d="M24 104V18H176V104Z"/>
  <path class="f" d="M24 30H176"/>
  <circle class="l" cx="32" cy="24" r="2"/><circle class="l" cx="40" cy="24" r="2"/><circle class="l" cx="48" cy="24" r="2"/>
  <path class="o type" pathLength="1" style="animation-delay:0s" d="M34 44H52M56 44H110"/>
  <path class="f type" pathLength="1" style="animation-delay:.5s" d="M34 56H52M56 56H140"/>
  <path class="c type" pathLength="1" style="animation-delay:1s" d="M34 68H52M56 68H96"/>
  <path class="f type" pathLength="1" style="animation-delay:1.5s" d="M34 80H52M56 80H124"/>
  <path class="a" d="M34 92L40 95L34 98"/>
  <rect class="af blink" x="44" y="91" width="7" height="8"/>
  `,
);

const INFO = svg(
  "0 0 200 120",
  `
  <path class="l" d="M10 108H190"/>
  <!-- manuals on the shelf -->
  <path class="f g" d="M22 108V94H72V108Z"/>
  <path class="f g" d="M26 94V82H68V94Z"/>
  <path class="l" d="M30 88h22M26 101h34"/>
  <!-- the open field manual -->
  <path class="f g" d="M82 100L130 92L178 100V46L130 38L82 46Z"/>
  <path class="f" d="M130 38V92"/>
  <path class="l type" pathLength="1" d="M90 54L122 49M90 62L122 57M90 70L114 66M90 78L122 73"/>
  <!-- its schematic: the mast and its signal -->
  <path class="i" d="M154 84V60M149 84h10M151 74l3-8 3 8"/>
  <path class="i pulse" d="M147 54a9 9 0 0 0 0 10M161 54a9 9 0 0 1 0 10"/>
  <circle class="af blink" cx="154" cy="58" r="1.8"/>
  <!-- bookmark and tabs -->
  <path class="a" d="M166 44V60L170 56L174 60V45"/>
  <path class="f" d="M178 54h6v8h-6M178 66h6v8h-6"/>
  `,
);

const LOST = svg(
  "0 0 200 120",
  `
  <path class="l" d="M0 104C50 98 90 108 130 102S180 98 200 100"/>
  <path class="f" d="M100 104L94 50L106 50L100 104M96 70L104 62M95 84L105 76"/>
  <path class="f" d="M94 50L78 34L72 38"/>
  <path class="c" d="M120 32A20 20 0 0 1 120 60M128 24A30 30 0 0 1 128 68"/>
  <path class="c" d="M116 22L138 70"/>
  <g class="l flicker">
    <path d="M20 30h14M40 30h6M150 40h22M160 48h8M24 70h10M156 80h16M30 84h6"/>
  </g>
  `,
);

const GENERIC = svg(
  "0 0 200 120",
  `
  <path class="l" d="M0 104C50 98 90 108 130 102S180 98 200 100"/>
  <path class="f" d="M108 104L100 40L92 104M95 80L104 64M96 60L102 48"/>
  <circle class="af blink" cx="100" cy="36" r="2.5"/>
  ${arcs(100, 36, [10, 18, 26])}
  `,
);

const SCENES = {
  hero: HERO,
  maps: MAPS,
  library: LIBRARY,
  knowledge: LIBRARY,
  mesh: MESH,
  system: SYSTEM,
  logs: LOGS,
  info: INFO,
  lost: LOST,
  generic: GENERIC,
};

export const ILLUSTRATIONS = Object.keys(SCENES);

/** SVG markup of an illustration (a module id works too; unknown -> generic). */
export function illustration(name, className = "") {
  const markup = SCENES[name] ?? SCENES.generic;
  return className ? markup.replace('class="il ', `class="il ${className} `) : markup;
}
