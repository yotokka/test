import { expect, test, type Page } from '@playwright/test';
import { MISSILES } from '../../src/data/reference/missiles';
import { GAME_CLASSES } from '../../src/game/classes';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900;
const narrow = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1280;

async function aside(page: Page) {
  if (narrow(page) && (await page.locator('.inspector').getAttribute('data-open')) !== 'true') {
    await page.getByRole('button', { name: 'Параметры' }).click();
    await page.waitForTimeout(350); // выдвижная панель анимируется
  }
  return page.getByRole('complementary');
}
async function closeAside(page: Page) {
  if (narrow(page) && (await page.locator('.inspector').getAttribute('data-open')) === 'true') {
    await page.getByRole('complementary').getByRole('button', { name: 'Закрыть' }).click();
    await page.waitForTimeout(350);
  }
}
const tree = (page: Page) => page.getByRole('listbox');
const map = (page: Page) => page.locator('.sc-svg');

async function clickMap(page: Page, fx: number, fy: number) {
  await map(page).scrollIntoViewIfNeeded();
  const b = (await map(page).boundingBox())!;
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
}

test.describe('Мир и сценарии: основной путь', () => {
  test('дата → ветка → редактор → запуск → журнал → сохранение и восстановление', async ({ page }) => {
    await page.goto('/#/history?d=1990-10-02');
    await page.getByRole('button', { name: /Создать ветку от этой даты/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: /Создать ветку и открыть редактор/ }).click();
    await expect(page.getByRole('button', { name: 'Редактирование сценария', pressed: true })).toBeVisible();
    await expect(page.locator('.sc-title')).toContainText('ветвление 02.10.1990');

    // Участник — исторический субъект, существующий в ветке на дату эпизода
    const a = await aside(page);
    await a.getByPlaceholder('Например, Франция').fill('Германская Демокр');
    await a.getByRole('button', { name: 'Германская Демократическая Республика' }).click();
    await expect(a.locator('.sc-parts')).toContainText('Германская Демократическая Республика');
    await closeAside(page);

    // Объект из каталога: выбрать класс и щёлкнуть по карте
    await page.getByRole('button', { name: /В-κ.*транспортный/ }).click();
    await clickMap(page, 0.6, 0.45);
    await expect(tree(page).getByText('В-κ-1')).toBeVisible();
    await page.keyboard.press('Escape');

    // Маршрут: точка на карте
    await tree(page).getByText('В-κ-1').click();
    const card = await aside(page);
    await card.getByRole('button', { name: '+ Точки маршрута' }).click();
    await closeAside(page);
    await clickMap(page, 0.45, 0.6);
    await page.keyboard.press('Escape');
    await expect((await aside(page)).getByText('Маршрут (1 точек)')).toBeVisible();
    await closeAside(page);

    // Проверка и запуск
    await page.getByRole('button', { name: /Проверить и запустить/ }).click();
    await expect(page.getByRole('button', { name: 'Воспроизведение сценария', pressed: true })).toBeVisible();
    await page.getByLabel('Скорость показа эпизода').selectOption('60');
    await page.getByRole('button', { name: 'Запуск' }).click();
    await expect(page.locator('.sc-log')).toContainText('взлёт', { timeout: 15_000 });
    await page.getByRole('button', { name: 'Пауза' }).click();

    // Сохранение и восстановление после перезагрузки
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    await expect(page.locator('.sc-save')).toContainText('Сохранено в списке');
    await page.goto('/#/history');
    await page.reload();
    await page.getByRole('button', { name: 'Восстановить' }).click();
    await expect(tree(page).getByText('В-κ-1')).toBeVisible();
    await page.getByRole('button', { name: 'Открыть…' }).click();
    await expect(page.getByRole('dialog')).toContainText('Ветка от 02.10.1990');
  });

  test('возврат к истории не теряет сценарий, историческая база не меняется', async ({ page }) => {
    await page.goto('/#/history?mode=edit&scn=demo:gdr');
    await expect(page.locator('.sc-title')).toContainText('ветвление 02.10.1990');
    await page.getByRole('tab', { name: 'Ветка и история' }).click();
    await expect(page.locator('.sc-branch')).toContainText('Не применено: Событие прекращает субъект');
    await page.getByRole('button', { name: 'Историческое воспроизведение' }).click();
    await expect(page.locator('.hclock-date')).toHaveText('05.10.1990');
    await page.getByRole('searchbox', { name: /Название страны/ }).fill('Германская Демократическая');
    await expect(page.getByText('На эту дату таких субъектов нет')).toBeVisible();
    await page.getByRole('button', { name: 'Редактирование сценария' }).click();
    await expect(page.locator('.sc-title input')).toHaveValue('Ветка 1990: ГДР сохраняется');
  });
});

test.describe('Редактор: действия', () => {
  test('отмена и повтор, дублирование через контекстное меню', async ({ page }) => {
    test.skip(isMobile(page), 'контекстное меню мышью проверяется на компьютере');
    await page.goto('/#/history?mode=edit&scn=demo:motion');
    const count = () => page.locator('.sc-left [role=option]').count();
    await expect(page.locator('.sc-left [role=option]').first()).toBeVisible();
    const n0 = await count();
    await page.getByRole('button', { name: /З-θ.*универсальный/ }).click();
    await clickMap(page, 0.3, 0.3);
    await expect.poll(count).toBe(n0 + 1);
    await page.getByRole('button', { name: /Отменить/ }).click();
    await expect.poll(count).toBe(n0);
    await page.getByRole('button', { name: /Повторить/ }).click();
    await expect.poll(count).toBe(n0 + 1);
    await page.keyboard.press('Escape');
    // Контекстное меню на объекте
    const obj = page.locator('[data-obj]').last();
    await obj.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /Дублировать/ }).click();
    await expect.poll(count).toBe(n0 + 2);
  });

  test('клавиатура: добавление курсором, сдвиг, удаление, отмена', async ({ page }) => {
    test.skip(isMobile(page), 'клавиатура проверяется на компьютере');
    await page.goto('/#/history?mode=edit&scn=demo:motion');
    const count = () => page.locator('.sc-left [role=option]').count();
    await expect(page.locator('.sc-left [role=option]').first()).toBeVisible();
    const n0 = await count();
    await page.getByRole('button', { name: /Н-ρ.*наблюдения/ }).focus();
    await page.keyboard.press('Enter');
    await page.locator('.sc-map').focus().catch(() => {});
    await page.locator('h1, .sc-save').first().click();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Enter');
    await expect.poll(count).toBe(n0 + 1);
    await page.keyboard.press('Escape');
    // Выделенный объект сдвигается стрелками в режиме «Редактирование»
    await page.keyboard.press('e');
    const card = await aside(page);
    const x0 = await card.getByLabel(/x \(восток\)/).inputValue();
    await page.locator('.sc-save').click();
    await page.keyboard.press('ArrowRight');
    await expect(card.getByLabel(/x \(восток\)/)).not.toHaveValue(x0);
    await page.keyboard.press('Delete');
    await expect.poll(count).toBe(n0);
    await page.keyboard.press('Control+z');
    await expect.poll(count).toBe(n0 + 1);
  });

  test('проверка сценария показывает несовместимые настройки понятным текстом', async ({ page }) => {
    await page.goto('/#/history?mode=edit&scn=demo:motion');
    await page.getByRole('button', { name: /Н-β.*носитель/ }).click();
    await clickMap(page, 0.5, 0.5);
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: /Проверка/ }).click();
    await expect(page.locator('.sc-issues')).toContainText('нагрузка не загружена');
    await page.getByRole('button', { name: /Проверить и запустить/ }).click();
    await expect(page.locator('.sc-toast')).toContainText('Запуск невозможен');
    await expect(page.getByRole('button', { name: 'Редактирование сценария', pressed: true })).toBeVisible();
  });
});

test.describe('Воспроизведение', () => {
  test('автопауза на отделении нагрузки, «Почему?» раскрывает цепочку', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/#/history?mode=play&scn=demo:carrier');
    await page.getByLabel('Момент эпизода, секунды').fill('1000');
    await page.getByLabel('Скорость показа эпизода').selectOption('60');
    await page.getByRole('button', { name: 'Запуск' }).click();
    await expect(page.locator('.sc-timebar')).toContainText('Автопауза', { timeout: 40_000 });
    await expect(page.getByRole('button', { name: 'Запуск' })).toBeVisible();
    await page.locator('.sc-log-row[data-kind=separation]').first().getByRole('button', { name: 'Почему?' }).click();
    const a = await aside(page);
    await expect(a.getByRole('dialog', { name: /Почему/ })).toContainText('П-16');
  });

  test('ручное управление: решение ждёт в очереди действий', async ({ page }) => {
    await page.goto('/#/history?mode=play&scn=demo:manual');
    await page.getByLabel('Скорость показа эпизода').selectOption('60');
    await page.getByRole('tab', { name: /Очередь действий/ }).click();
    // Автопауза на решениях: продолжаем, пока решение не встанет в очередь
    for (let i = 0; i < 20 && !(await page.locator('.sc-queue').isVisible()); i++) {
      const run = page.getByRole('button', { name: 'Запуск' });
      if (await run.isVisible()) await run.click();
      await page.waitForTimeout(700);
    }
    await expect(page.locator('.sc-queue')).toBeVisible();
    await page.locator('.sc-queue').getByRole('button', { name: 'Разрешить' }).first().click();
    await expect(page.locator('.sc-cmds')).toContainText('authorize');
  });

  test('повтор с тем же начальным состоянием даёт тот же отпечаток; шаг и перемотка', async ({ page }) => {
    await page.goto('/#/history?mode=play&scn=demo:motion');
    await page.getByRole('button', { name: 'Шаг 0,5 с' }).click();
    await expect(page.locator('.sc-clock')).toContainText('t = 00:00');
    await page.getByRole('button', { name: '+10 с' }).click();
    await expect(page.locator('.sc-clock')).toContainText('t = 00:10');
    await page.getByLabel('Момент эпизода, секунды').fill('600');
    await expect(page.locator('.sc-clock')).toContainText('t = 10:00');
    await page.getByRole('button', { name: /Повтор/ }).click();
    await expect(page.getByText(/отпечаток журнала .* — совпал/)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Погода без API', () => {
  test('недоступность сети: причина, ручные условия, без подмены нулями', async ({ page }) => {
    await page.route(/open-meteo\.com/, (r) => r.abort('blockedbyclient'));
    await page.goto('/#/history?mode=edit&scn=demo:gdr');
    const a = await aside(page);
    await a.getByRole('button', { name: /Загрузить снимок Open-Meteo/ }).click();
    await expect(a.getByRole('alert')).toContainText('Погода не загружена');
    await expect(a.getByRole('alert')).toContainText('Текущая погода вместо архивной не подставляется');
    await a.getByRole('alert').getByRole('button', { name: 'Ручные условия' }).click();
    await expect(a.getByText('Ручные условия (не исторические)')).toBeVisible();
    await expect(a.getByPlaceholder('не задано').first()).toHaveValue('');
  });

  test('снимок с пропусками: «нет данных» вместо нуля, источник и время данных', async ({ page }) => {
    const hours = ['1990-10-05T08:00', '1990-10-05T09:00'];
    const loc = { latitude: 50.5, longitude: 13.5, hourly_units: { temperature_2m: '°C', precipitation: 'mm' }, hourly: { time: hours, temperature_2m: [9, 10], precipitation: [null, null], wind_speed_10m: [4, 5], wind_direction_10m: [250, 260], cloud_cover: [null, null], weather_code: [3, 3] } };
    await page.route(/archive-api\.open-meteo\.com/, (r) => r.fulfill({ json: Array.from({ length: 17 }, () => loc) }));
    await page.goto('/#/history?mode=edit&scn=demo:gdr');
    const a = await aside(page);
    await a.getByRole('button', { name: /Загрузить снимок Open-Meteo/ }).click();
    const t = a.locator('.sc-wx-data');
    await expect(t).toContainText('Осадки за час');
    await expect(t.locator('tr', { hasText: 'Осадки за час' })).toContainText('нет данных');
    await expect(t.locator('tr', { hasText: 'Температура на 2 м' })).toContainText('10 °C');
    await expect(t).toContainText('era5');
    await expect(t).toContainText('1990-10-05T09:00Z');
    await expect(t).toContainText('CC BY 4.0');
  });
});

test.describe('Разделение данных и телефон', () => {
  test('игровые классы не попадают в справочник, справочные названия — в игровой каталог', async ({ page }) => {
    await page.goto('/#/reference');
    const ref = await page.locator('#main').textContent();
    for (const c of GAME_CLASSES) expect(ref).not.toContain(c.name);
    await page.goto('/#/history?mode=edit&scn=demo:carrier');
    const cat = await page.locator('.sc-catalog').textContent();
    for (const m of MISSILES) expect(cat).not.toContain(m.name);
  });

  test('старая ссылка на учебную симуляцию открывает редактор с перенесённым сценарием', async ({ page }) => {
    await page.goto('/#/simulation');
    await expect(page.locator('.sc-title input')).toHaveValue(/Полигон: Этапы по порядку/);
    await expect(page.getByText('Условная учебная модель. Не прогноз реальных боевых действий.')).toBeVisible();
  });

  test('телефон: без горизонтальной прокрутки, касание выбирает объект, панель свойств открывается', async ({ page }) => {
    test.skip(!isMobile(page), 'только для узкого экрана');
    await page.goto('/#/history?mode=edit&scn=demo:carrier');
    await expect(page.locator('.sc-map')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await tree(page).getByText('Н-β-1').tap();
    await expect(page.getByRole('complementary')).toContainText('Условный самолёт-носитель');
    await page.getByRole('complementary').getByRole('button', { name: 'Закрыть' }).click();
    await page.locator('[data-obj="o2"]').tap();
    await expect(page.getByRole('complementary')).toBeVisible();
  });
});
