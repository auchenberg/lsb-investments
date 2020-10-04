require("dotenv").config();

const puppeteer = require("puppeteer");
const args = [
  "--disable-web-security",
  "--disable-features=IsolateOrigins,site-per-process",
];

(async () => {
  console.log("============================");
  console.log("LSB Portfolio scraper");
  console.log("============================");

  console.log("Starting browser...");

  const browser = await puppeteer.launch({ headless: true, args });

  console.log("Navigating to LSB...");

  const page = await browser.newPage();
  await page.goto("https://bank.lsb.dk/lsb/netbank/privat/adgang/logon/", {
    waitUntil: "networkidle2",
  });

  console.log("Waiting for NemID...");

  await page.waitForSelector("iframe");

  const frameHandle = await page.$(
    'iframe[src*="https://applet.danid.dk/launcher/lmt"]'
  );

  const frame = await frameHandle.contentFrame();

  console.log("Filling out NemID...");

  // Fill out NemID form
  let elmInputUsername = await frame.waitForSelector(
    `input[aria-labeledby="userid-label"]`
  );

  await elmInputUsername.type(process.env.LSB_USERNAME, {
    delay: 10,
  });

  await frameHandle.press("Tab");

  let elmInputPassword = await frame.waitForSelector(`input[type="password"]`);
  await elmInputPassword.type(process.env.LSB_PASSWORD, {
    delay: 10,
  });

  await frame.click(`button.button--submit`);

  // Trigger 2FA
  console.log("Triggering 2FA for NemID...");

  await frame.waitForSelector(`.nmas h1`);

  await frame.click(`button.button--submit`);

  console.log("Waiting for 2FA to complete...");

  await page.waitForNavigation({
    waitUntil: "networkidle0",
  });

  console.log("2FA completed");

  // Wait until accounts have loaded
  console.log("Waiting for accounts to load...");
  await page.waitForSelector(`.account_accountlist4`);

  // Navigate to BankLink
  console.log("Navigating to investments...");

  await page.goto(
    "https://bank.lsb.dk/lsb/netbank/privat/investering/bank_link/",
    { waitUntil: "networkidle2" }
  );

  // Get portfolio value
  console.log("Getting portfolio values...");

  const portfolioValue = await page.evaluate(
    () =>
      document.querySelector(
        '#banklink tr:not([class]) > td[align="right"] .minitekst'
      ).innerText
  );

  let formattedPortfolioValue = portfolioValue.replace(/[,.]/g, (x) => {
    return x == "." ? "," : ".";
  });

  console.log("Portfolio value is: ", formattedPortfolioValue);

  console.log("Done 👋");

  await browser.close();
})();
