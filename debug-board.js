const { chromium } = require('@playwright/test');

(async () => {
    const browser = await chromium.launch();

    // Use storageState from the playwright config's auth file
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        storageState: '.auth/user.json'
    });

    const page = await context.newPage();

    // Train page
    await page.goto('http://localhost:3000/train', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    console.log('Current URL after train:', page.url());

    const trainSquares = await page.locator('[data-square]').all();
    console.log('Train squares count:', trainSquares.length);

    if (trainSquares.length > 0) {
        const first = await trainSquares[0].boundingBox();
        const last = await trainSquares[trainSquares.length - 1].boundingBox();
        console.log('Train first square:', JSON.stringify(first));
        console.log('Train last square:', JSON.stringify(last));
        if (first && last) {
            const trainBoardSize = {
                x: first.x,
                y: first.y,
                width: last.x + last.width - first.x,
                height: last.y + last.height - first.y
            };
            console.log('Train board calculated size:', JSON.stringify(trainBoardSize));
        }
        await page.screenshot({ path: 'qa-artifacts/train-board-actual.png', fullPage: false });
    } else {
        console.log('No chess squares found on train page');
        await page.screenshot({ path: 'qa-artifacts/train-page-actual.png', fullPage: false });
    }

    // Now go to disclaimer page
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('\nDisclaimer URL:', page.url());

    const discSquares = await page.locator('[data-square]').all();
    console.log('Disclaimer squares count:', discSquares.length);

    if (discSquares.length > 0) {
        const first = await discSquares[0].boundingBox();
        const last = await discSquares[discSquares.length - 1].boundingBox();
        console.log('Disc first square:', JSON.stringify(first));
        console.log('Disc last square:', JSON.stringify(last));
        if (first && last) {
            const discBoardSize = {
                x: first.x,
                y: first.y,
                width: last.x + last.width - first.x,
                height: last.y + last.height - first.y
            };
            console.log('Disc board calculated size:', JSON.stringify(discBoardSize));
        }
        await page.screenshot({ path: 'qa-artifacts/disclaimer-board-actual.png', fullPage: false });
    } else {
        console.log('No chess squares found on disclaimer page');
        await page.screenshot({ path: 'qa-artifacts/disclaimer-page-actual.png', fullPage: false });
    }

    console.log('\nScreenshots saved to qa-artifacts/');
    await browser.close();
})();