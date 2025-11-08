import { Injectable } from '@angular/core';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { Project } from './project.types';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private ai: GoogleGenAI;

  constructor() {
    if (!process.env.API_KEY) {
      throw new Error("API_KEY environment variable not set");
    }
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async generateProject(prompt: string): Promise<Project> {
    // Schema for the text-based project details
    const textResponseSchema = {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING },
        description: { type: Type.STRING },
        bom: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              component: { type: Type.STRING },
              quantity: { type: Type.INTEGER },
              description: { type: Type.STRING },
            },
            required: ['component', 'quantity', 'description'],
          },
        },
        arduinoCode: { type: Type.STRING },
        schematicDescription: { type: Type.STRING },
      },
      required: ['projectName', 'description', 'bom', 'arduinoCode', 'schematicDescription'],
    };

    try {
      // Step 1: Generate all text-based content for the project
      const textResponse: GenerateContentResponse = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Based on the following user prompt, generate a complete Arduino project. The Arduino code should be complete, valid, and include comments. The schematic description must be a clear, step-by-step guide for wiring. The BOM must be accurate. User Prompt: "${prompt}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: textResponseSchema,
        },
      });

      const jsonText = textResponse.text.trim();
      const textProjectData: Omit<Project, 'schematicPng'> = JSON.parse(jsonText);

      // Step 2: Generate the schematic image based on the text description
      const imagePrompt = `A high-resolution (1920x1080) professional circuit diagram for an Arduino project. 
      Project Name: "${textProjectData.projectName}". 
      Wiring Instructions: "${textProjectData.schematicDescription}". 
      The diagram must adhere to the following strict rules:
      1.  **Layout**: Logical arrangement with power at the bottom, Arduino in the center, and sensors/actuators at the top.
      2.  **Wiring**: Use only straight, orthogonal wires. No diagonal lines. No overlapping wires. Consistent spacing.
      3.  **Labels**: Clearly label all component pins (e.g., 'D13', 'GND', '5V').
      4.  **Colors**: Use RED for power (VCC, 5V), BLACK for ground (GND), and other distinct colors for signal wires.
      5.  **Style**: Clean, professional, and easy to read on a dark background.
      6.  **Format**: The output must be a PNG image.`;
      
      const imageResponse = await this.ai.models.generateImages({
        model: 'imagen-3.0-generate-002',
        prompt: imagePrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png', // SDK returns base64 string
          aspectRatio: '16:9',
        },
      });

      if (!imageResponse.generatedImages || imageResponse.generatedImages.length === 0 || !imageResponse.generatedImages[0].image.imageBytes) {
        throw new Error('Image generation failed: The model did not return an image.');
      }

      const schematicPng = imageResponse.generatedImages[0].image.imageBytes;

      // Step 3: Combine text data and image data into a single Project object
      return {
        ...textProjectData,
        schematicPng: schematicPng,
      };

    } catch (error) {
      console.error('Error generating project with Gemini API:', error);
      if (error instanceof Error && error.message.includes('Image generation failed')) {
         throw error;
      }
      throw new Error('Failed to generate project. The model may have returned an invalid response.');
    }
  }
}
