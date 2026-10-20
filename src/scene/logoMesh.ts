import { Color, ExtrudeGeometry, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Shape } from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

/**
 * Turns the VSM word (src/brand/logo-word.svg — the letters of the Ringed logo, filled paths only) into a solid
 * gold 3D object. The rings and planets of the logo are built as real 3D objects around it in Orrery.ts from the
 * same src/config/rings.json, so the 3D hero and the logo stay identical.
 */
export interface LogoMeshOptions {
  /** Width of the finished word in world units (rings.json distances are multiples of half this). */
  targetWidth?: number;
  /** Extrusion depth in SVG units (word is ~103 units tall). */
  depth?: number;
  /** Bevel size in SVG units. */
  bevel?: number;
  /** Phones/tablets: standard metal (no clearcoat layer) — cheaper to compile and render, near-identical at that size. */
  lite?: boolean;
}

export function createLogoMesh(wordSvg: string, opts: LogoMeshOptions = {}): Mesh<ExtrudeGeometry, MeshStandardMaterial> {
  const { targetWidth = 3.8, depth = 14, bevel = 1.4, lite = false } = opts;
  // Geometry only — colour comes from the material, so neutralise `currentColor` (SVGLoader can't parse it).
  const data = new SVGLoader().parse(wordSvg.replace(/currentColor/g, '#000'));
  // r185+: ShapePath.toShapes() applies the path's fill-rule (nonzero / evenodd).
  const shapes: Shape[] = data.paths.flatMap((p) => p.toShapes());
  if (shapes.length === 0) throw new Error('Brand word has no filled shapes to extrude');

  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel * 1.5,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  });
  geometry.center();
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const s = targetWidth / (box.max.x - box.min.x);
  // SVG is y-down; flip Y. Also flip Z so the determinant stays positive (keeps triangle winding / culling correct).
  geometry.scale(s, -s, -s);
  geometry.computeVertexNormals();

  // Slightly deeper than the UI gold: bright env reflections lift metal toward cream, so start warmer.
  const base = { color: new Color('#CFA24E'), metalness: 1, roughness: 0.3, envMapIntensity: 1.1 };
  const material: MeshStandardMaterial = lite
    ? new MeshStandardMaterial(base)
    : new MeshPhysicalMaterial({ ...base, clearcoat: 0.5, clearcoatRoughness: 0.18 });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'vsm-word';
  return mesh;
}
