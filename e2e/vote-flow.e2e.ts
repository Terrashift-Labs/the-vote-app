import { device, element, by, expect as detoxExpect, waitFor } from "detox";

describe("Vote Flow — smoke test", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  afterEach(async () => {
    await device.reloadReactNative?.();
  });

  it("shows country selection on first launch", async () => {
    await detoxExpect(element(by.id("country-picker"))).toBeVisible();
  });

  it("navigates to policy list after selecting a country", async () => {
    await element(by.id("country-picker")).tap();
    await element(by.text("United Kingdom")).tap();
    await element(by.id("btn-continue")).tap();
    await waitFor(element(by.id("policy-list")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("opens a policy detail screen", async () => {
    await element(by.id("policy-list-item-0")).tap();
    await waitFor(element(by.id("policy-detail-title")))
      .toBeVisible()
      .withTimeout(5000);
  });

  it("can select a vote option", async () => {
    await element(by.id("vote-option-support")).tap();
    await detoxExpect(element(by.id("vote-option-support"))).toHaveToggleValue(true);
  });

  it("shows biometric confirmation prompt on submit", async () => {
    await element(by.id("btn-submit-vote")).tap();
    await waitFor(element(by.id("biometric-prompt")))
      .toBeVisible()
      .withTimeout(5000);
  });
});
