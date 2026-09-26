const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

/** Форматирует дату с явной точностью: «29 ноября 2017 г.», «ноябрь 2017 г.», «2017 г.». */
export function formatPartialDate(d: string | null | undefined): string {
  if (!d) return 'не установлена';
  const [y, m, day] = d.split('-');
  if (day) return `${Number(day)} ${MONTHS_GEN[Number(m) - 1]} ${y} г.`;
  if (m) return `${MONTHS_NOM[Number(m) - 1]} ${y} г.`;
  return `${y} г.`;
}

export function formatDateShort(d: string): string {
  const [y, m, day] = d.split('-');
  return day ? `${day}.${m}.${y}` : m ? `${m}.${y}` : y;
}

export function formatKm(v: number): string {
  return v.toLocaleString('ru-RU').replace(/ /g, ' ');
}

export function pad3(n: number): string {
  return String(n).padStart(3, '0');
}
