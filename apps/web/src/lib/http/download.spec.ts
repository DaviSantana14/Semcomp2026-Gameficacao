import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "./download";

describe("downloadFile", () => {
  const fetchMock = vi.fn();
  let link: HTMLAnchorElement;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:presence");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );

    const createElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName) => {
      const element = createElement(tagName);
      if (tagName === "a") link = element as HTMLAnchorElement;
      return element;
    });
  });

  it("downloads the response as a blob with its server filename", async () => {
    const blob = new Blob(["tipo;periodo\r\n"], { type: "text/csv" });
    const response = {
      blob: vi.fn().mockResolvedValue(blob),
      headers: new Headers({
        "Content-Disposition": 'attachment; filename="presenca-2026.csv"',
      }),
      ok: true,
      status: 200,
      statusText: "OK",
    };
    fetchMock.mockResolvedValue(response);

    await downloadFile(
      "/admin/presence/export.csv?from=2026-08-16&to=2026-08-23",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/admin/presence/export.csv?from=2026-08-16&to=2026-08-23",
      { credentials: "include" },
    );
    expect(response.blob).toHaveBeenCalledTimes(1);
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(link.download).toBe("presenca-2026.csv");
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:presence");
  });

  it("does not parse a successful CSV response as JSON", async () => {
    const response = {
      blob: vi.fn().mockResolvedValue(new Blob(["csv"])),
      headers: new Headers(),
      ok: true,
      status: 200,
      statusText: "OK",
    };
    fetchMock.mockResolvedValue(response);

    await downloadFile(
      "/admin/presence/export.csv?from=2026-08-16&to=2026-08-23",
    );

    expect(response.blob).toHaveBeenCalledTimes(1);
  });
});
