import { describe, it, expect } from "vitest";
import { isPrivateOrReservedIp } from "@/lib/website-audit";

describe("isPrivateOrReservedIp", () => {
  it("blocks loopback", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
  });
  it("blocks RFC1918 private ranges", () => {
    expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.31.255.255")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
  });
  it("blocks link-local / cloud metadata address", () => {
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
  });
  it("blocks IPv6 unique-local and link-local", () => {
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
  });
  it("allows ordinary public IPv4 addresses", () => {
    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("172.15.0.1")).toBe(false); // just outside the 172.16-31 private range
    expect(isPrivateOrReservedIp("172.32.0.1")).toBe(false);
  });
});
