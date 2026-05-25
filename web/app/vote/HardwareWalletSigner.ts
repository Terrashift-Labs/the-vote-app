"use client";

/**
 * HardwareWalletSigner — Ledger (and Trezor-compatible) signing for vote payloads.
 *
 * Uses the WebUSB/WebHID transport to communicate directly with a connected
 * hardware wallet from the browser. No private key ever touches JavaScript.
 *
 * Supported devices:
 *   • Ledger Nano S / S Plus / X / Stax (WebUSB)
 *   • Ledger Nano (WebHID fallback)
 *   • Trezor (via TrezorConnect — separate bundle, opt-in)
 *
 * Usage:
 *   const signer = new HardwareWalletSigner();
 *   const { address, signature } = await signer.signVote(votePayload);
 */

export interface VotePayload {
  policyId:    string;
  optionId:    string;
  nullifier:   string;
  countryCode: string;
  timestamp:   number;
}

export interface SignedVote {
  address:   string;         // Ethereum address derived from device
  signature: string;         // EIP-712 signature (hex)
  payload:   VotePayload;
}

export type HardwareWalletState =
  | { status: "idle" }
  | { status: "connecting" }
  | { status: "connected"; address: string; device: string }
  | { status: "awaiting_confirmation" }
  | { status: "signed"; result: SignedVote }
  | { status: "error"; message: string };

// EIP-712 domain and types for the vote payload
const EIP712_DOMAIN = {
  name:    "TheVoteApp",
  version: "1",
  chainId: 1,
} as const;

const EIP712_TYPES = {
  Vote: [
    { name: "policyId",    type: "string" },
    { name: "optionId",    type: "string" },
    { name: "nullifier",   type: "bytes32" },
    { name: "countryCode", type: "string" },
    { name: "timestamp",   type: "uint256" },
  ],
} as const;

export class HardwareWalletSigner {

  private transport: any  = null;
  private ethApp:    any  = null;
  private _address:  string = "";

  get address(): string { return this._address; }

  /**
   * Connect to the first available Ledger device.
   * Requests WebUSB permission — the browser will show a device picker.
   */
  async connect(): Promise<{ address: string; deviceModel: string }> {
    // Dynamic imports keep the Ledger SDK out of the initial bundle
    const { default: TransportWebUSB } = await import("@ledgerhq/hw-transport-webusb");
    const { default: Eth }             = await import("@ledgerhq/hw-app-eth");

    this.transport = await TransportWebUSB.create();
    this.ethApp    = new Eth(this.transport);

    // Derive the first account (m/44'/60'/0'/0/0)
    const { address } = await this.ethApp.getAddress("44'/60'/0'/0/0", false, false);
    this._address = address;

    const deviceModel = (this.transport as any).deviceModel?.productName ?? "Ledger";
    return { address, deviceModel };
  }

  /**
   * Sign a vote payload using EIP-712 typed data.
   * The device will display the vote details for the user to confirm.
   */
  async signVote(payload: VotePayload): Promise<SignedVote> {
    if (!this.ethApp) throw new Error("Not connected — call connect() first");

    const typedData = {
      domain: EIP712_DOMAIN,
      types:  EIP712_TYPES,
      primaryType: "Vote" as const,
      message: payload,
    };

    // Ledger requires the JSON as a string
    const { v, r, s } = await this.ethApp.signEIP712Message(
      "44'/60'/0'/0/0",
      typedData
    );

    // Encode r+s+v into a 65-byte Ethereum signature
    const signature = "0x" +
      r.padStart(64, "0") +
      s.padStart(64, "0") +
      (v + 27).toString(16).padStart(2, "0");

    return { address: this._address, signature, payload };
  }

  /**
   * Disconnect and release the USB transport.
   */
  async disconnect(): Promise<void> {
    await this.transport?.close();
    this.transport = null;
    this.ethApp    = null;
    this._address  = "";
  }

  /**
   * Check if WebUSB is available in this browser.
   * Returns false in non-secure contexts or unsupported browsers.
   */
  static isSupported(): boolean {
    return typeof navigator !== "undefined" && "usb" in navigator;
  }
}

/**
 * TrezorSigner — thin wrapper around TrezorConnect.
 * Loaded lazily so it doesn't bloat the bundle for Ledger users.
 */
export async function signWithTrezor(payload: VotePayload): Promise<SignedVote> {
  const TrezorConnect = (await import("@trezor/connect-web")).default;

  await TrezorConnect.init({
    lazyLoad:      true,
    manifest: { email: "security@thevoteapp.org", appUrl: "https://thevoteapp.org" },
  });

  const typedData = {
    types: {
      EIP712Domain: [
        { name: "name",    type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
      Vote: EIP712_TYPES.Vote,
    },
    primaryType: "Vote",
    domain:  EIP712_DOMAIN,
    message: payload,
  };

  const result = await TrezorConnect.ethereumSignTypedData({
    path:            "m/44'/60'/0'/0/0",
    data:            typedData as any,
    metamask_v4_compat: true,
  });

  if (!result.success) throw new Error(result.payload.error);

  return {
    address:   result.payload.address,
    signature: result.payload.signature,
    payload,
  };
}
