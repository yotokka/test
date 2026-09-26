import { expect, test, type Page } from '@playwright/test';
import { MISSILES } from '../../src/data/reference/missiles';
import { COUNTRIES } from '../../src/sim/world';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900;

async function openAside(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) < 1280) {
    if ((await page.locator('.inspector').getAttribute('data-open')) === 'true') return;
    await page.getByRole('button', { name: 'Параметры' }).click();
  }
}

test.describe('Справочник', () => {
  test('поиск и пустое состояние', async ({ page }) => {
    await page.goto('/#/reference');
    const search = page.getByRole('searchbox');
    await search.fill('минитмен');
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
    await search.fill('Minuteman');
    await expect(page.getByRole('heading', { name: 'LGM-30G Minuteman III' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Найдено: 1' })).toBeVisible();
  });

  test('фильтры по стране, типу и периоду', async ({ page }) => {
    await page.goto('/#/reference');
    await page.getByLabel('Страна').selectOption('ru');
    await page.getByLabel('Тип').selectOption('cruise');
    const cards = page.locator('.card');
    // «Калибр», «Клаб» и Х-55 (СССР/Россия)
    await expect(cards).toHaveCount(3);
    for (const c of await cards.all()) await expect(c).toContainText('Россия');
    await page.getByLabel('Период').selectOption('ww2');
    await expect(page.getByText('Ничего не найдено')).toBeVisible();
    await page.getByRole('button', { name: 'Сбросить фильтры' }).first().click();
    await expect(cards).toHaveCount(MISSILES.length);
  });

  test('фильтр «нет надёжных данных» и карточка без чисел', async ({ page }) => {
    await page.goto('/#/reference');
    await page.getByLabel('Данные о дальности').selectOption('none');
    await expect(page.locator('.card')).toHaveCount(MISSILES.filter((m) => m.ranges.length === 0).length);
    await expect(page.locator('.card').first()).toContainText('Нет надёжных открытых данных');
  });

  test('карточка показывает статус, источник, даты и расхождение', async ({ page }) => {
    await page.goto('/#/reference?tab=missiles&id=hwasong15');
    await openAside(page);
    const aside = page.getByRole('complementary');
    await expect(aside.getByText('Результат испытаний').first()).toBeVisible();
    await expect(aside.getByText('Оценка').first()).toBeVisible();
    await expect(aside.getByText('Почему значения расходятся')).toBeVisible();
    await expect(aside.getByText('ноябрь 2017 г.')).toBeVisible();
    await expect(aside.getByText('по поисковой выдаче').first()).toBeVisible();
  });

  test('вкладки ПВО и соглашений', async ({ page }) => {
    await page.goto('/#/reference');
    await page.getByRole('tab', { name: 'ПВО: принципы' }).click();
    await expect(page.getByText('Цепочка этапов противовоздушной обороны')).toBeVisible();
    await page.getByRole('tab', { name: 'Соглашения и союзы' }).click();
    await expect(page.getByRole('heading', { name: 'Договор о РСМД' })).toBeVisible();
    await expect(page.getByText('Участие в союзе не означает автоматического перехвата').first()).toBeVisible();
  });
});

test.describe('Сравнение и источники', () => {
  test('добавление в сравнение и таблица', async ({ page }) => {
    await page.goto('/#/compare');
    await page.getByRole('button', { name: 'Очистить всё' }).click();
    await expect(page.getByText('Для сравнения ничего не выбрано')).toBeVisible();
    await page.goto('/#/reference');
    await page.getByRole('button', { name: /Сравнить.*«Калибр»/ }).click();
    await page.getByRole('button', { name: /Сравнить.*«Клаб»/ }).click();
    await page.goto('/#/compare');
    const table = page.locator('.compare-table');
    await expect(table.locator('thead th')).toHaveCount(3);
    await expect(table).toContainText('1 500–2 500 км');
    await expect(table).toContainText('до 300 км');
    await expect(page.getByRole('img', { name: /График опубликованных значений/ })).toBeVisible();
  });

  test('ссылки на источники открываются в новой вкладке', async ({ page }) => {
    await page.goto('/#/sources');
    const link = page.getByRole('link', { name: /North Korea’s Third ICBM Launch/ });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', 'https://www.38north.org/2017/11/melleman112917/');
    await page.getByRole('searchbox').fill('38 North');
    await page.getByRole('button', { name: /знач\./ }).first().click();
    await openAside(page);
    await expect(page.getByRole('complementary').getByText('ноябрь 2017 г.')).toBeVisible();
  });
});

test.describe('Учебная симуляция', () => {
  test('подпись всегда видна, запуск, пауза, шаг, сброс', async ({ page }) => {
    await page.goto('/#/simulation');
    await expect(page.getByText('Условная учебная модель. Не прогноз реальных боевых действий.')).toBeVisible();
    const clock = page.locator('.clock');
    await expect(clock).toContainText('T+000');
    await page.getByRole('button', { name: 'Шаг' }).click();
    await expect(clock).toContainText('T+001');
    await page.getByRole('button', { name: '4×' }).click();
    await page.getByRole('button', { name: /Запуск|Продолжить/ }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Пауза' }).click();
    const t1 = await clock.textContent();
    await page.waitForTimeout(400);
    expect(await clock.textContent()).toBe(t1);
    expect(t1).not.toContain('T+001 ');
    await page.getByRole('button', { name: 'Сброс' }).click();
    await expect(clock).toContainText('T+000');
    await expect(page.getByText('Условная учебная модель. Не прогноз реальных боевых действий.')).toBeVisible();
  });

  test('повтор сценария даёт тот же отпечаток и тот же журнал', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.getByLabel('Учебный сценарий').selectOption('saturation');
    const scrub = page.getByLabel('Шкала времени (такты)');
    const max = await scrub.getAttribute('max');
    await scrub.fill(max!);
    const log1 = await page.locator('.log-entry').allTextContents();
    const fp1 = await page.locator('.fp .mono').first().textContent();
    await page.getByRole('button', { name: 'Повтор сценария' }).click();
    await expect(page.getByText('Повторный прогон дал тот же отпечаток')).toBeVisible();
    await page.getByRole('button', { name: 'Пауза' }).click();
    await scrub.fill(max!);
    expect(await page.locator('.log-entry').allTextContents()).toEqual(log1);
    expect(await page.locator('.fp .mono').first().textContent()).toBe(fp1);
  });

  test('другое зерно — другой ход, возврат зерна — прежний', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.getByLabel('Учебный сценарий').selectOption('saturation');
    const fp = () => page.locator('.fp .mono').first().textContent();
    const original = await fp();
    await page.getByLabel('Зерно генератора').fill('42');
    await page.getByRole('button', { name: 'Применить' }).click();
    expect(await fp()).not.toBe(original);
    await page.getByRole('button', { name: 'Исходное' }).click();
    expect(await fp()).toBe(original);
  });

  test('клавиатура: пробел запускает и останавливает, R сбрасывает', async ({ page }) => {
    test.skip(isMobile(page), 'клавиатурные сокращения проверяются на компьютере');
    await page.goto('/#/simulation');
    await page.locator('h1').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.clock')).toContainText('T+001');
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Продолжить' })).toBeVisible();
    await page.keyboard.press('r');
    await expect(page.locator('.clock')).toContainText('T+000');
  });

  test('правило в журнале объясняет событие; отношения меняют правило', async ({ page }) => {
    await page.goto('/#/simulation');
    await page.getByLabel('Учебный сценарий').selectOption('alliance');
    const scrub = page.getByLabel('Шкала времени (такты)');
    await scrub.fill((await scrub.getAttribute('max'))!);
    await expect(page.locator('.log').getByText('передача данных союзнику')).toBeVisible();
    await page.locator('.log .rule-chip', { hasText: 'П-2' }).first().click();
    await expect(page.getByRole('complementary').getByText('Союз без совместной обороны')).toBeVisible();
    await page.getByRole('complementary').getByRole('tab', { name: 'Отношения' }).click();
    const row = page.locator('.rel-row').filter({ hasText: 'Аврелия' }).filter({ hasText: 'Борея' });
    await row.getByLabel('Совместная оборона').check();
    await expect(page.getByText('Настройки отношений изменены')).toBeVisible();
    await page.keyboard.press('Escape');
    await scrub.fill((await scrub.getAttribute('max'))!);
    await expect(page.locator('.log').getByText('передача данных союзнику')).toHaveCount(0);
  });

  test('учебные данные не смешаны со справочными', async ({ page }) => {
    await page.goto('/#/simulation');
    const simText = await page.locator('#main').textContent();
    for (const m of MISSILES) expect(simText).not.toContain(m.name);
    await page.goto('/#/reference');
    const refText = await page.locator('#main').textContent();
    for (const c of COUNTRIES) expect(refText).not.toContain(c.name);
  });
});

test.describe('Телефон', () => {
  test('меню и панель параметров выдвигаются', async ({ page }) => {
    test.skip(!isMobile(page), 'только для узкого экрана');
    await page.goto('/#/reference');
    await expect(page.getByRole('navigation', { name: 'Разделы атласа' })).toBeHidden();
    await page.getByRole('button', { name: 'Открыть меню разделов' }).click();
    await page.getByRole('link', { name: 'Сравнение' }).click();
    await expect(page.locator('.topbar-title')).toHaveText('Сравнение');
    await page.getByRole('button', { name: 'Параметры' }).click();
    await expect(page.getByRole('complementary')).toBeVisible();
    await page.getByRole('complementary').getByRole('button', { name: 'Закрыть' }).click();
    await expect(page.getByRole('complementary')).toBeHidden();
    // Страница не прокручивается по горизонтали
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
