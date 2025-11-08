export interface BomItem {
  component: string;
  quantity: number;
  description: string;
}

export interface Project {
  projectName: string;
  description: string;
  bom: BomItem[];
  arduinoCode: string;
  schematicDescription: string;
  schematicPng: string;
}
