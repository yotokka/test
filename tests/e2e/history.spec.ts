import { expect, test, type Page } from '@playwright/test';

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 900;
const clock = (page: Page) => page.locator('.hclock-date');

async function openCard(page: Page) {
  if ((page.viewportSize()?.width ?? 1440) < 1280 && (await page.locator('.inspector').getAttribute('data-open')) !== 'true') {
    await page.getByRole('button', { name: 'Параметры' }).click();
  }
  return page.getByRole('complementary');
}

async function goDate(page: Page, iso: string) {
  await page.getByLabel('Дата', { exact: true }).fill(iso);
  await page.getByRole('button', { name: 'Перейти', exact: true }).click();
}

test.describe('Исторический мир', () => {
  test('дата из адреса, карточка страны и сохранение даты в адресе', async ({ page }) => {
    await page.goto('/#/history?d=1990-10-03&sel=gw:260');
    await expect(clock(page)).toHaveText('03.10.1990');
    const card = await openCard(page);
    await expect(card.getByRole('heading', { name: 'Федеративная Республика Германия' })).toBeVisible();
    await expect(card.getByText('Berlin')).toBeVisible();
    if (isMobile(page)) await card.getByRole('button', { name: 'Закрыть' }).click();
    await goDate(page, '1990-10-02');
    await expect(clock(page)).toHaveText('02.10.1990');
    await expect(page).toHaveURL(/d=1990-10-02/);
    const card2 = await openCard(page);
    await expect(card2.getByText('Bonn')).toBeVisible();
  });

  test('шаги по дням и календарным месяцам, переход к следующему событию', async ({ page }) => {
    await page.goto('/#/history?d=1992-01-31');
    await page.getByRole('button', { name: '+мес' }).click();
    await expect(clock(page)).toHaveText('29.02.1992');
    await page.getByRole('button', { name: '−день' }).click();
    await expect(clock(page)).toHaveText('28.02.1992');
    await page.getByRole('button', { name: '+год' }).click();
    await expect(clock(page)).toHaveText('28.02.1993');
    await goDate(page, '1992-12-31');
    await page.getByRole('button', { name: /Событие ⏭/ }).click();
    await expect(clock(page)).toHaveText('01.01.1993');
    const card = await openCard(page);
    await expect(card.getByText('Что изменилось в атласе')).toBeVisible();
  });

  test('состояние до и после распада Чехословакии в поиске страны', async ({ page }) => {
    await page.goto('/#/history?d=1992-12-31');
    const search = page.getByRole('searchbox', { name: /Название страны/ });
    await search.fill('Чех');
    await expect(page.locator('.hresults')).toContainText('Чехословакия');
    await expect(page.locator('.hresults')).not.toContainText('Чешская Республика');
    await page.getByRole('button', { name: '+день' }).click();
    await expect(page.getByText('На эту дату таких субъектов нет')).toBeVisible();
    await search.fill('Чеш');
    await expect(page.locator('.hresults')).toContainText('Чешская Республика');
  });

  test('воспроизведение, пауза и остановка на ключевом событии', async ({ page }) => {
    await page.goto('/#/history?d=1990-06-01');
    await page.getByRole('button', { name: '1 год/сек' }).click();
    await page.getByRole('button', { name: 'Пуск' }).click();
    // Остановка на ключевом событии — кнопка снова «Пуск», открыто событие
    await expect(page.getByRole('button', { name: 'Пуск' })).toBeVisible({ timeout: 10_000 });
    const stopped = await clock(page).textContent();
    expect(stopped).not.toBe('01.06.1990');
    const card = await openCard(page);
    await expect(card.getByText('Что изменилось в атласе')).toBeVisible();

    if (isMobile(page)) await card.getByRole('button', { name: 'Закрыть' }).click();
    await page.getByLabel('Останавливаться на ключевых событиях').uncheck();
    await page.getByRole('button', { name: '1 день/сек' }).click();
    await page.getByRole('button', { name: 'Пуск' }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: 'Пауза' }).click();
    const t = await clock(page).textContent();
    await page.waitForTimeout(700);
    expect(await clock(page).textContent()).toBe(t);
    expect(t).not.toBe(stopped);
  });

  test('перемотка назад и журнал промежуточных изменений', async ({ page }) => {
    await page.goto('/#/history?d=1994-01-01');
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await page.getByRole('button', { name: '1 год/сек' }).click();
    await page.getByRole('button', { name: 'Пуск' }).click();
    await expect(page.getByRole('button', { name: 'Пуск' })).toBeVisible({ timeout: 10_000 });
    const d = await clock(page).textContent();
    const [dd, mm, yy] = d!.split('.').map(Number);
    expect(yy * 10000 + mm * 100 + dd).toBeLessThan(19940101);
    // Большой скачок: журнал содержит промежуточные изменения
    await goDate(page, '1989-01-01');
    await goDate(page, '1994-01-01');
    await page.getByRole('tab', { name: /Журнал сеанса/ }).click();
    await expect(page.locator('.tl-list')).toContainText('Германская Демократическая Республика');
    await expect(page.locator('.tl-list')).toContainText('Чехословакия');
  });

  test('закладки сохраняются, диалог «Почему карта выглядит так?», пробел покрытия карты', async ({ page }) => {
    await page.goto('/#/history?d=2015-06-01');
    await page.getByRole('button', { name: '☆ В закладки' }).click();
    await expect(page.getByLabel('Закладки')).toContainText('Закладки (1)');
    await page.reload();
    await expect(page.getByLabel('Закладки')).toContainText('Закладки (1)');
    await page.getByRole('button', { name: /Почему карта выглядит так/ }).click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByText('Крым').first()).toBeVisible();
    await expect(dlg.getByText('Западная Сахара').first()).toBeVisible();
    await expect(dlg.getByText(/не следует читать как признанную границу/).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dlg).toBeHidden();
    await goDate(page, '2021-01-01');
    await expect(page.getByText(/Дата вне покрытия CShapes/)).toBeVisible();
  });

  test('клавиатура: стрелки и переход к событию', async ({ page }) => {
    test.skip(isMobile(page), 'клавиатура проверяется на компьютере');
    await page.goto('/#/history?d=1990-10-02');
    await page.locator('.hclock').click();
    await page.keyboard.press('ArrowRight');
    await expect(clock(page)).toHaveText('03.10.1990');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(clock(page)).toHaveText('03.09.1990');
    await page.keyboard.press(']');
    await expect(clock(page)).not.toHaveText('03.09.1990');
    await page.getByLabel('Останавливаться на ключевых событиях').uncheck();
    await page.locator('.hclock').click();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Пауза' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Пуск' })).toBeVisible();
  });

  test('телефон: нет горизонтальной прокрутки, карточка открывается', async ({ page }) => {
    test.skip(!isMobile(page), 'только для узкого экрана');
    await page.goto('/#/history?d=2011-07-09&sel=gw:626');
    await expect(clock(page)).toHaveText('09.07.2011');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const card = await openCard(page);
    await expect(card.getByRole('heading', { name: 'Южный Судан' })).toBeVisible();
  });
});
