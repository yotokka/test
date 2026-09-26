import { expect, test, type Page } from '@playwright/test';
import { MISSILES } from '../../src/data/reference/missiles';

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

test.describe('Каталог техники', () => {
  test('фильтр по категории и историческому периоду; эксплуатант с периодом и источником', async ({ page }) => {
    await page.goto('/#/reference?tab=equipment');
    await page.getByLabel('Категория').selectOption('fighter');
    await page.getByLabel('Этап').selectOption('service');
    await page.getByLabel('Год').fill('1970');
    const list = page.locator('.eq-list');
    await expect(list).toContainText('МиГ-25');
    await expect(list).not.toContainText('Saab 37 Viggen');
    await expect(list).not.toContainText('МиГ-21'); // без записи этапа «служба» модификация не проходит фильтр
    await page.getByLabel('Год').fill('1972');
    await expect(list).toContainText('Saab 37 Viggen');
    await list.getByRole('button', { name: /Saab 37 Viggen/ }).click();
    await openAside(page);
    const aside = page.getByRole('complementary');
    await expect(aside).toContainText('1972 г. — 2007 г.');
    await expect(aside.getByText('Поставлено').locator('xpath=following-sibling::dd[1]')).toHaveText('не установлено');
    await page.keyboard.press('Escape'); // закрыть выдвижную панель на узком экране
    await page.goto('/#/reference?tab=equipment');
    await page.getByRole('tab', { name: 'Таблица покрытия' }).click();
    await expect(page.getByRole('table').first()).toContainText('Беспилотные аппараты');
  });
});
