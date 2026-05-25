import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /.well-known/security.txt
 * RFC 9116 — machine-readable security disclosure policy.
 */
router.get("/security.txt", (_req: Request, res: Response) => {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  res.type("text/plain").send(
    [
      "Contact: mailto:security@thevoteapp.org",
      "Contact: https://immunefi.com/bounty/thevoteapp",
      `Expires: ${expires.toISOString()}`,
      "Acknowledgments: https://github.com/TheVoteApp/the-vote-app/blob/main/docs/hall-of-fame.md",
      "Preferred-Languages: en",
      "Canonical: https://api.thevoteapp.org/.well-known/security.txt",
      "Policy: https://github.com/TheVoteApp/the-vote-app/blob/main/.github/SECURITY.md",
      "Hiring: https://github.com/TheVoteApp/the-vote-app/blob/main/.github/CONTRIBUTING.md",
    ].join("\n") + "\n"
  );
});

export default router;
