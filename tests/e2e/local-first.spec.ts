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
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Calm' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Close check-in' }).click();

  await page.reload();

  await expect(page.getByText('Drink tea slowly')).toBeVisible();
  await page.getByRole('button', { name: 'Continue morning check-in' }).click();
  await expect(page.getByText('Appreciate', { exact: true })).toBeVisible();
});

const completeCheckInBySkipping = async (
  page: Page,
  kind: 'morning' | 'evening',
): Promise<void> => {
  await page.getByRole('button', { name: `Begin ${kind} check-in` }).click();

  const remainingSteps = kind === 'morning' ? 6 : 7;
  await page.getByRole('button', { name: 'Skip' }).click();

  for (let step = 0; step < remainingSteps; step += 1) {
    await page.getByRole('button', { name: 'Skip' }).click();
  }

  await expect(
    page.getByRole('button', { name: 'Return to today' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Return to today' }).click();
};

test('completes distinct morning and evening check-ins and edits an answer', async ({
  page,
}) => {
  await page.goto('/');
  await completeCheckInBySkipping(page, 'morning');
  await completeCheckInBySkipping(page, 'evening');

  await expect(
    page.getByRole('button', { name: 'Review morning check-in' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Review evening check-in' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Review morning check-in' }).click();
  await page.getByRole('button', { name: 'Review answers' }).click();
  await page.getByRole('button', { name: 'Steady' }).click();
  await page.getByRole('button', { name: 'Light' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Close check-in' }).click();

  await page.getByRole('button', { name: 'Review morning check-in' }).click();
  await page.getByRole('button', { name: 'Review answers' }).click();
  await expect(page.getByRole('button', { name: 'Steady' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: 'Light' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('autosaves a journal offline and renders its markdown after reload', async ({
  context,
  page,
}) => {
  await prepareServiceWorker(page);
  await page.goto('/journal');
  await context.setOffline(true);

  await page.getByRole('button', { name: 'New entry' }).click();
  await page.getByLabel('Entry title').fill('A quiet afternoon');
  await page
    .getByLabel('Journal entry')
    .fill('The rain sounded **soft** against the window.');
  await page.waitForTimeout(700);

  await page.reload();
  await expect(page.getByLabel('Entry title')).toHaveValue('A quiet afternoon');
  await expect(page.getByLabel('Journal entry')).toHaveValue(
    'The rain sounded **soft** against the window.',
  );

  await page.getByRole('button', { name: 'Finish writing' }).click();
  await expect(page.getByText('soft', { exact: true })).toBeVisible();
});

test('synchronizes a journal between two paired browsers', async ({
  browser,
}) => {
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  const title = `Shared reflection ${Date.now()}`;

  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();

    await pairBrowser(firstPage);
    await pairBrowser(secondPage);

    await firstPage.goto('/journal');
    await firstPage.getByRole('button', { name: 'New entry' }).click();
    await firstPage.getByLabel('Entry title').fill(title);
    await firstPage
      .getByLabel('Journal entry')
      .fill('A **clear** thought, kept for later.');
    await firstPage.getByRole('button', { name: 'Finish writing' }).click();
    await expect(firstPage.getByText('Synced')).toBeVisible();

    await secondPage.goto('/settings');
    await secondPage.getByRole('button', { name: 'Sync now' }).click();
    await secondPage.goto('/journal');
    await secondPage.getByRole('button', { name: new RegExp(title) }).click();
    await expect(secondPage.getByText('clear', { exact: true })).toBeVisible();
  } finally {
    await Promise.all([firstContext.close(), secondContext.close()]);
  }
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
