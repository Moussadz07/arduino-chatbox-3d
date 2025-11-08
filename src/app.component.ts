import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GeminiService } from './gemini.service';
import { Project } from './project.types';

interface ChatMessage {
  role: 'user' | 'model' | 'system';
  content: string;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class AppComponent {
  private geminiService = inject(GeminiService);
  private sanitizer = inject(DomSanitizer);

  prompt = signal('Create a simple project to blink an LED every second using the built-in LED on an Arduino Uno.');
  isLoading = signal(false);
  project = signal<Project | null>(null);
  error = signal<string | null>(null);
  activeTab = signal<'code' | 'bom' | 'schematic'>('code');
  chatHistory = signal<ChatMessage[]>([
    { role: 'system', content: 'Welcome to Arduino ChatBox 3D! Describe your project idea to get started.' }
  ]);
  
  schematicImageUrl = computed<SafeUrl | null>(() => {
    const pngBase64 = this.project()?.schematicPng;
    if (pngBase64) {
      const imageUrl = `data:image/png;base64,${pngBase64}`;
      return this.sanitizer.bypassSecurityTrustUrl(imageUrl);
    }
    return null;
  });

  async handlePromptSubmit(): Promise<void> {
    if (!this.prompt().trim() || this.isLoading()) {
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.project.set(null);
    this.chatHistory.update(history => [...history, { role: 'user', content: this.prompt() }]);
    
    const currentPrompt = this.prompt();
    this.prompt.set(''); // Clear input after submission

    try {
      const result = await this.geminiService.generateProject(currentPrompt);
      this.project.set(result);
      this.chatHistory.update(history => [...history, { role: 'model', content: `I have generated the project "${result.projectName}". You can view the details in the output panel.` }]);
    } catch (e: any) {
      const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred.';
      this.error.set(errorMessage);
      this.chatHistory.update(history => [...history, { role: 'system', content: `Error: ${errorMessage}` }]);
    } finally {
      this.isLoading.set(false);
    }
  }

  selectTab(tab: 'code' | 'bom' | 'schematic'): void {
    this.activeTab.set(tab);
  }
  
  private downloadFile(content: string, filename: string, mimeType: string): void {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  downloadCode(): void {
    const proj = this.project();
    if (proj) {
      const filename = proj.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.ino';
      this.downloadFile(proj.arduinoCode, filename, 'text/plain');
    }
  }

  downloadBOM(): void {
    const proj = this.project();
    if (proj && proj.bom) {
      const header = 'Component,Quantity,Description\n';
      const csvContent = proj.bom.map(item =>
        `"${item.component.replace(/"/g, '""')}",${item.quantity},"${item.description.replace(/"/g, '""')}"`
      ).join('\n');
      const filename = proj.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_bom.csv';
      this.downloadFile(header + csvContent, filename, 'text/csv');
    }
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    try {
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return new Blob([byteArray], { type: mimeType });
    } catch (e) {
      console.error('Failed to decode base64 string:', e);
      return new Blob([], { type: mimeType });
    }
  }

  downloadSchematic(): void {
    const proj = this.project();
    if (proj && proj.schematicPng) {
      const filename = proj.projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '_schematic.png';
      const blob = this.base64ToBlob(proj.schematicPng, 'image/png');

      if (blob.size === 0) {
        this.error.set("Download failed: The generated image data is invalid.");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }
}
