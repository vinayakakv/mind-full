import { expect, type Page, test } from '@playwright/test';

const pairBrowser = async (page: Page): Promise<void> => {
  await page.goto('/settings');
  await page.getByLabel('Pairing code').fill('mindfull-local');
  await page.getByRole('button', { name: 'Pair browser' }).click();
  await expect(page.getByText('This browser is paired.')).toBeVisible();
};

const prepareServiceWorker = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
};

test('keeps tasks and a check-in draft through an offline reload', async ({
  context,
  page,
}) => {
  await prepareServiceWorker(page);
  await context.setOffline(true);

  await page.getByLabel('New task').fill('Drink tea slowly');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Begin morning check-in' }).click();
  await page.getByRole('button', { name: "I'm here" }).click();
  await page.getByRole('button', { name: 'Steady' }).click();
  await page.getByRole('button', { name: 'At ease' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Close check-in' }).click();

  await page.reload();

  await expect(page.getByText('Drink tea slowly')).toBeVisible();
  await page.getByRole('button', { name: 'Continue morning check-in' }).click();
  await expect(
    page.getByRole('heading', {
      name: 'What is one good thing already present?',
    }),
  ).toBeVisible();
});

test('synchronizes a task between two paired browsers', async ({ browser }) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const taskText = `Notice the evening sky ${Date.now()}`;

  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await pairBrowser(firstPage);
    await pairBrowser(secondPage);

    await firstPage.goto('/');
    await firstPage.getByLabel('New task').fill(taskText);
    await firstPage.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(firstPage.getByText('Synced')).toBeVisible();

    await secondPage.goto('/settings');
    await secondPage.getByRole('button', { name: 'Sync now' }).click();
    await secondPage.goto('/');
    await expect(secondPage.getByText(taskText)).toBeVisible();
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
});
