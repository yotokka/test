import type { CatalogFamily, OperatorPeriod } from './catalog';
import { SEARCH_CHECK } from './sources';
import type { Check, Milestone } from './types';

/**
 * Дополнительные семейства каталога: истребители, бомбардировщики, разведчики, беспилотники,
 * авиационные ракеты и авиационная крылатая ракета. Только сведения, видимые в поисковой выдаче по
 * официальным, музейным и производственным страницам (26.09.2026); сами страницы из среды не открывались.
 * Если в выдаче нет даты или эксплуатанта — поле пустое, а не домысленное. Количество — только если его
 * называет источник; «произведено» не приравнивается ни к «поставлено», ни к «в строю».
 */

const chk = (note?: string): Check => (note ? { ...SEARCH_CHECK, note } : SEARCH_CHECK);
const ms = (kind: Milestone['kind'], date: string, sourceId: string, note?: string): Milestone => ({ kind, date, sourceId, check: SEARCH_CHECK, note });

function op(operator: string, entityIds: string[], sourceId: string, o: Partial<OperatorPeriod> & { uncertainty: string }): OperatorPeriod {
  return { operator, entityIds, from: null, to: null, confirmedUntil: null, sourceId, check: chk(), ordered: null, delivered: null, inService: null, ...o };
}

const US = ['gw:2'];
const SU = ['gw:365'];
const UK = ['gw:200'];
const FR = ['gw:220'];
const SE = ['gw:380'];

export const CATALOG_FAMILIES_EXTRA: CatalogFamily[] = [
  /* ———— Истребители и перехватчики ———— */
  {
    id: 'f15',
    name: 'F-15 Eagle',
    category: 'fighter',
    origin: 'us',
    description: 'Всепогодный тактический истребитель ВВС США.',
    sourceIds: ['af-f15'],
    variants: [
      {
        id: 'f15a',
        name: 'F-15A Eagle',
        milestones: [ms('test', '1972-07', 'af-f15', 'первый полёт F-15A'), ms('service', '1974-11', 'af-f15', 'поступление в ВВС США')],
        operators: [op('us', US, 'af-f15', { from: '1974-11', uncertainty: 'Начало — поступление в ВВС США по справке ВВС; окончание эксплуатации модификации A и численность в выдаче не приведены.' })],
      },
    ],
  },
  {
    id: 'f16',
    name: 'F-16 Fighting Falcon',
    category: 'fighter',
    origin: 'us',
    description: 'Многоцелевой истребитель ВВС США; широко экспортировался (эксплуатанты за рубежом в этой сборке не установлены).',
    sourceIds: ['af-f16'],
    variants: [
      {
        id: 'f16a',
        name: 'F-16A Fighting Falcon',
        milestones: [ms('test', '1976-12', 'af-f16', 'первый полёт F-16A'), ms('service', '1979-01', 'af-f16', 'первый строевой F-16A передан 388-му тактическому истребительному крылу')],
        operators: [op('us', US, 'af-f16', { from: '1979-01', uncertainty: 'Начало — первая поставка строевого самолёта; окончание эксплуатации F-16A и численность не установлены.' })],
      },
    ],
  },
  {
    id: 'mig21',
    name: 'МиГ-21',
    altNames: ['MiG-21', 'Fishbed'],
    category: 'fighter',
    origin: 'su',
    description: 'Советский истребитель; по музейной справке, разными версиями пользовались более 50 стран.',
    sourceIds: ['nmusaf-mig21'],
    variants: [
      {
        id: 'mig21pf',
        name: 'МиГ-21ПФ',
        designation: 'MiG-21PF «Fishbed-D»',
        milestones: [ms('test', '1955', 'nmusaf-mig21', 'первый полёт МиГ-21 (семейство, не модификация ПФ)')],
        operators: [],
        note: 'В выдаче нет дат принятия на вооружение и перечня эксплуатантов с периодами. «Более 50 стран» — не основание считать систему доступной конкретной стороне.',
      },
    ],
  },
  {
    id: 'mig25',
    name: 'МиГ-25',
    altNames: ['MiG-25', 'Foxbat'],
    category: 'fighter',
    origin: 'su',
    historicalTerm: 'перехватчик и разведчик',
    description: 'Советский высокоскоростной перехватчик и разведчик.',
    sourceIds: ['nmusaf-mig25'],
    variants: [
      {
        id: 'mig25',
        name: 'МиГ-25',
        milestones: [ms('service', '1970', 'nmusaf-mig25', 'поступление на службу')],
        operators: [op('su', SU, 'nmusaf-mig25', { from: '1970', uncertainty: 'Справка музея называет год поступления на службу советского самолёта; окончание эксплуатации и численность не установлены. Эксплуатация после 1991 г. Россией в этой сборке не подтверждена.', confirmedUntil: null })],
      },
    ],
  },
  {
    id: 'harrier',
    name: 'Harrier',
    category: 'fighter',
    origin: 'uk',
    historicalTerm: 'самолёт вертикального взлёта и посадки',
    description: 'Британский штурмовик-истребитель с вертикальным взлётом.',
    sourceIds: ['raf-harrier'],
    variants: [
      {
        id: 'harrier-gr1',
        name: 'Harrier GR1',
        milestones: [ms('test', '1967-12', 'raf-harrier', 'первый полёт серийного GR1'), ms('service', '1969', 'raf-harrier', 'поступление в Королевские ВВС')],
        operators: [op('uk', UK, 'raf-harrier', { from: '1969', uncertainty: 'Источники в выдаче расходятся в месяце начала службы: 1 апреля или июль 1969 г. (№ 1 эскадрилья). Окончание эксплуатации GR1 не установлено.' })],
      },
    ],
  },
  {
    id: 'mirage2000',
    name: 'Mirage 2000',
    category: 'fighter',
    origin: 'fr',
    description: 'Французский многоцелевой истребитель; первый вариант — истребитель ПВО.',
    sourceIds: ['dassault-m2000'],
    variants: [
      {
        id: 'mirage2000c',
        name: 'Mirage 2000 (вариант ПВО)',
        milestones: [ms('test', '1978-03', 'dassault-m2000', 'первый полёт Mirage 2000-01 в Истре'), ms('service', '1984', 'dassault-m2000', 'ввод в строй ВВС Франции')],
        operators: [op('fr', FR, 'dassault-m2000', { from: '1984', uncertainty: 'Дата — по материалам производителя; окончание эксплуатации и численность не установлены. Страница выдачи не открывалась.' })],
      },
    ],
  },
  {
    id: 'viggen',
    name: 'Saab 37 Viggen',
    category: 'fighter',
    origin: 'se',
    description: 'Шведский многоцелевой самолёт: версии истребителя, штурмовика, разведчика и учебного.',
    sourceIds: ['saab-viggen'],
    variants: [
      {
        id: 'viggen',
        name: 'Saab 37 Viggen (все версии)',
        milestones: [ms('service', '1972', 'saab-viggen', 'начало использования Вооружёнными силами Швеции')],
        operators: [
          op('se', SE, 'saab-viggen', {
            from: '1972',
            to: '2007',
            uncertainty: 'Период — по исторической странице производителя. Произведено «более 300» во всех версиях — это выпуск, а не поставки или состав в строю.',
          }),
        ],
      },
    ],
  },
  {
    id: 'me262',
    name: 'Messerschmitt Me 262 Schwalbe',
    category: 'fighter',
    origin: 'de',
    historicalTerm: 'реактивный истребитель',
    description: 'По справке NASM — первый боевой реактивный истребитель.',
    sourceIds: ['nasm-me262'],
    variants: [
      {
        id: 'me262a1a',
        name: 'Me 262 A-1a',
        milestones: [],
        operators: [],
        note: 'Дата поступления на службу в выдаче не приведена; Германия 1939–1945 гг. не входит в историческую базу с 1970 г.',
      },
    ],
  },

  /* ———— Бомбардировщики и самолёты-носители ———— */
  {
    id: 'b52',
    name: 'B-52 Stratofortress',
    category: 'bomber',
    origin: 'us',
    description: 'Дальний тяжёлый бомбардировщик ВВС США; носитель крылатых ракет AGM-86.',
    sourceIds: ['afgsc-b52'],
    variants: [
      {
        id: 'b52',
        name: 'B-52 (семейство)',
        milestones: [ms('test', '1952-04', 'afgsc-b52', 'первый полёт'), ms('service', '1955-06', 'afgsc-b52', 'начальная боеготовность')],
        operators: [op('us', US, 'afgsc-b52', { from: '1955-06', uncertainty: 'Начальная боеготовность семейства; периоды отдельных модификаций и численность по годам не установлены. В выдаче сказано, что самолёт остаётся в составе бомбардировочных сил, но дата этого утверждения не указана.' })],
      },
    ],
  },
  {
    id: 'b1b',
    name: 'B-1B Lancer',
    category: 'bomber',
    origin: 'us',
    description: 'Дальний бомбардировщик ВВС США.',
    sourceIds: ['af-b1b'],
    variants: [
      {
        id: 'b1b',
        name: 'B-1B Lancer',
        milestones: [ms('service', '1985-06', 'af-b1b', 'первый B-1 передан на авиабазу Дайесс')],
        operators: [op('us', US, 'af-b1b', { from: '1985-06', uncertainty: 'Формулировка найдена в выдаче по группе официальных страниц; к какой именно странице она относится, не установлено — сверить.' })],
      },
    ],
  },
  {
    id: 'b2',
    name: 'B-2 Spirit',
    category: 'bomber',
    origin: 'us',
    description: 'Малозаметный дальний бомбардировщик ВВС США.',
    sourceIds: ['afgsc-b2-missouri'],
    variants: [
      {
        id: 'b2',
        name: 'B-2 Spirit',
        milestones: [ms('service', '1993-12', 'afgsc-b2-missouri', 'первый B-2 прибыл на авиабазу Уайтмен 17.12.1993')],
        operators: [op('us', US, 'afgsc-b2-missouri', { from: '1993-12', uncertainty: 'Прибытие первого самолёта в часть — не то же самое, что боеготовность. Численность не установлена.' })],
      },
    ],
  },
  {
    id: 'vulcan',
    name: 'Avro Vulcan',
    category: 'bomber',
    origin: 'uk',
    historicalTerm: 'бомбардировщик серии «V»',
    description: 'Британский стратегический бомбардировщик.',
    sourceIds: ['raf-vulcan'],
    variants: [
      {
        id: 'vulcan',
        name: 'Vulcan (семейство)',
        milestones: [ms('service', '1956', 'raf-vulcan', 'поступление в 230-е подразделение переподготовки, Уоддингтон')],
        operators: [op('uk', UK, 'raf-vulcan', { from: '1956', to: '1984-03', uncertainty: 'Окончание — расформирование № 50 эскадрильи 31.03.1984 по справке RAF Museum. Численность не установлена.' })],
      },
    ],
  },
  {
    id: 'tornado',
    name: 'Panavia Tornado',
    category: 'bomber',
    origin: 'uk',
    historicalTerm: 'ударный самолёт',
    description: 'Ударный самолёт совместной европейской разработки; здесь — эксплуатация Королевскими ВВС. Страна происхождения указана по эксплуатанту в источнике, а не по консорциуму.',
    sourceIds: ['raf-tornado'],
    variants: [
      {
        id: 'tornado-gr1',
        name: 'Tornado GR1',
        milestones: [ms('service', '1982', 'raf-tornado', 'поступление в Королевские ВВС')],
        operators: [op('uk', UK, 'raf-tornado', { from: '1982', uncertainty: 'Окончание эксплуатации в выдаче не подтверждено; эксплуатация другими странами в этой сборке не установлена.' })],
      },
    ],
  },
  {
    id: 'ar234',
    name: 'Arado Ar 234 Blitz',
    category: 'bomber',
    origin: 'de',
    historicalTerm: 'реактивный бомбардировщик-разведчик',
    description: 'По справке NASM — первый боевой реактивный бомбардировщик и разведчик.',
    sourceIds: ['nasm-ar234'],
    variants: [
      {
        id: 'ar234b2',
        name: 'Ar 234 B-2',
        milestones: [ms('service', '1944-08', 'nasm-ar234', 'первый боевой вылет (разведка над Нормандией) 02.08.1944')],
        operators: [op('de', [], 'nasm-ar234', { from: '1944-08', to: '1945-05', uncertainty: 'Период относится к Германии 1939–1945 гг., которой нет в исторической базе с 1970 г. Окончание — по истории музейного экземпляра (служил до мая 1945 г.).' })],
      },
    ],
  },

  /* ———— Разведывательные и вспомогательные ———— */
  {
    id: 'u2',
    name: 'U-2 Dragon Lady',
    category: 'recon-support',
    origin: 'us',
    description: 'Высотный разведчик ВВС США.',
    sourceIds: ['usafa-u2'],
    variants: [
      {
        id: 'u2s',
        name: 'U-2S',
        milestones: [ms('service', '1955', 'usafa-u2', 'год начала службы семейства по справке Академии ВВС')],
        operators: [
          op('us', US, 'usafa-u2', {
            from: '1955',
            uncertainty: '1955 — год для семейства U-2, а не для модификации U-2S. Дата справки не установлена.',
            inService: { value: 33, qualifier: 'exact', asOf: null, sourceId: 'usafa-u2', note: '«Инвентарь» по справке без даты; произведено 35 — это выпуск, а не состав в строю.' },
          }),
        ],
      },
    ],
  },
  {
    id: 'sr71',
    name: 'SR-71 Blackbird',
    category: 'recon-support',
    origin: 'us',
    description: 'Стратегический разведчик ВВС США.',
    sourceIds: ['nmusaf-sr71'],
    variants: [
      {
        id: 'sr71a',
        name: 'SR-71A',
        milestones: [ms('test', '1964-12', 'nmusaf-sr71', 'первый полёт 22.12.1964')],
        operators: [],
        note: 'Даты начала и окончания службы в выдаче не приведены: эксплуатант с периодом не записан.',
      },
    ],
  },
  {
    id: 'e3',
    name: 'E-3 Sentry (AWACS)',
    category: 'recon-support',
    origin: 'us',
    historicalTerm: 'самолёт дальнего радиолокационного обнаружения',
    description: 'Самолёт дальнего радиолокационного обнаружения и управления ВВС США.',
    sourceIds: ['acc-e3'],
    variants: [
      {
        id: 'e3',
        name: 'E-3 Sentry',
        milestones: [ms('service', '1977', 'acc-e3', '«с 1977 г.» по справке Командования боевой авиации')],
        operators: [op('us', US, 'acc-e3', { from: '1977', uncertainty: 'Эксплуатация другими странами и численность в этой сборке не установлены.' })],
      },
    ],
  },

  /* ———— Беспилотные аппараты ———— */
  {
    id: 'mq1',
    name: 'RQ-1 / MQ-1 Predator',
    category: 'uav',
    origin: 'us',
    description: 'Беспилотный аппарат средней высоты и большой продолжительности полёта.',
    sourceIds: ['creech-mq1'],
    variants: [
      {
        id: 'mq1',
        name: 'MQ-1 Predator',
        milestones: [],
        operators: [op('us', US, 'creech-mq1', { from: null, to: '2018-03', uncertainty: 'Официальная церемония вывода из эксплуатации ВВС США — 09.03.2018. Дата начала службы в выдаче не приведена.' })],
      },
    ],
  },
  {
    id: 'mq9',
    name: 'MQ-9 Reaper',
    category: 'uav',
    origin: 'us',
    description: 'Ударно-разведывательный беспилотный аппарат ВВС США.',
    sourceIds: ['af-mq9'],
    variants: [{ id: 'mq9', name: 'MQ-9 Reaper', milestones: [], operators: [], note: 'Даты в выдаче не показаны; эксплуатант с периодом не записан.' }],
  },
  {
    id: 'rq4',
    name: 'RQ-4 Global Hawk',
    category: 'uav',
    origin: 'us',
    description: 'Высотный беспилотный разведчик большой продолжительности полёта.',
    sourceIds: ['af-rq4'],
    variants: [{ id: 'rq4', name: 'RQ-4 Global Hawk', milestones: [], operators: [], note: 'Даты в выдаче не показаны; эксплуатант с периодом не записан.' }],
  },

  /* ———— Авиационные ракеты ———— */
  {
    id: 'aim9',
    name: 'AIM-9 Sidewinder',
    category: 'air-missile',
    origin: 'us',
    description: 'Управляемая ракета «воздух — воздух» с тепловой головкой самонаведения.',
    sourceIds: ['af-aim9'],
    variants: [{ id: 'aim9', name: 'AIM-9 (семейство)', milestones: [], operators: [], note: 'Модификации и даты в выдаче не показаны; эксплуатант с периодом не записан.' }],
  },
  {
    id: 'aim120',
    name: 'AIM-120 AMRAAM',
    category: 'air-missile',
    origin: 'us',
    description: 'Управляемая ракета «воздух — воздух» средней дальности.',
    sourceIds: ['af-aim120'],
    variants: [{ id: 'aim120', name: 'AIM-120 (семейство)', milestones: [], operators: [], note: 'Даты в выдаче не показаны; эксплуатант с периодом не записан.' }],
  },

  /* ———— Крылатые ракеты авиационного базирования ———— */
  {
    id: 'agm86',
    name: 'AGM-86 ALCM',
    category: 'cruise',
    origin: 'us',
    description: 'Крылатая ракета воздушного базирования для B-52H.',
    sourceIds: ['af-agm86'],
    variants: [
      {
        id: 'agm86b',
        name: 'AGM-86B',
        milestones: [ms('service', '1982', 'af-agm86', 'в эксплуатации с 1982 г.')],
        operators: [op('us', US, 'af-agm86', { from: '1982', uncertainty: 'Численность и окончание эксплуатации не установлены.' })],
      },
    ],
  },
];
