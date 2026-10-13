import { describe, expect, it } from "vitest";
import {
  MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH_DIP,
  MAC_TRAFFIC_LIGHT_EDGE_DIP,
  MAC_TRAFFIC_LIGHT_POSITION,
} from "./window-chrome.js";

describe("macOS traffic-light geometry", () => {
  it("derives the cluster edge from the position the main process applies", () => {
    expect(MAC_TRAFFIC_LIGHT_EDGE_DIP).toBe(
      MAC_TRAFFIC_LIGHT_POSITION.x + MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH_DIP,
    );
  });

  it("pins the measured native geometry the renderer reserve is built on", () => {
    // y=18 sets button-centre ≈ 25px which aligns within ≤1px of the 48px
    // navbar's centre (24px). x=16 and cluster width are macOS-26 measurements.
    expect(MAC_TRAFFIC_LIGHT_POSITION).toEqual({ x: 16, y: 18 });
    expect(MAC_TRAFFIC_LIGHT_CLUSTER_WIDTH_DIP).toBe(60);
  });
});
