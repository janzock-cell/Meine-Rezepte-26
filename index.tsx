import { GoogleGenAI, Type } from "@google/genai";
import Cropper from 'cropperjs';
import confetti from 'canvas-confetti';

// --- Gemini API Schemas ---
const recipeSchema = {
    type: Type.OBJECT,
    properties: {
        recipeName: { type: Type.STRING },
        description: { type: Type.STRING },
        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
        instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
        nutrition: {
            type: Type.OBJECT,
            properties: {
                calories: { type: Type.STRING },
                protein: { type: Type.STRING },
                carbs: { type: Type.STRING },
                fat: { type: Type.STRING }
            },
            required: ["calories", "protein", "carbs", "fat"]
        }
    },
    required: ["recipeName", "description", "ingredients", "instructions", "nutrition"],
};

const combinedScanSchema = {
    type: Type.OBJECT,
    properties: {
        isReadable: {
            type: Type.BOOLEAN,
            description: "True, wenn Lebensmittel oder ein Kühlschrankinhalt eindeutig erkannt wurden."
        },
        unreadableReason: {
            type: Type.STRING,
            description: "Grund für Nicht-Lesbarkeit, falls isReadable false ist."
        },
        ingredients: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Liste der erkannten Zutaten (z.B. '3 Tomaten', 'Käse')."
        }
    },
    required: ["isReadable"]
};

// --- Types ---
export interface Recipe {
    id: string;
    recipeName: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    servings: number;
    difficulty?: string;
    createdAt: number;
    nutrition?: {
        calories: string;
        protein: string;
        carbs: string;
        fat: string;
    };
}

export interface ShoppingItem {
    id: string;
    text: string;
    completed: boolean;
}

// --- Global State ---
const QA_LOGS: any[] = [];
let currentLoaderPhase = "Standby";
let currentDisplayedRecipe: Recipe | null = null;
let currentCropper: Cropper | null = null;
let currentIngredients: string[] = [];
let loadingInterval: any = null;

function logAction(type: string, data: any) {
    const entry = {
        timestamp: new Date().toLocaleTimeString(),
        type,
        phase: currentLoaderPhase,
        data
    };
    QA_LOGS.push(entry);
    updateDebugUI();
}

function updateDebugUI() {
    const logEl = document.getElementById('debug-api-log');
    if (logEl) logEl.textContent = JSON.stringify(QA_LOGS.slice(-5), null, 2);
}

const getEl = (id: string) => document.getElementById(id);

export function showToast(msg: string, type: 'info' | 'error' = 'info') {
    const container = getEl('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${type === 'error' ? '🚫' : '👨‍🍳'} ${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// Element Accessors
export const promptInput = () => getEl('prompt-input') as HTMLInputElement;
export const servingsInput = () => getEl('servings-input') as HTMLInputElement;
export const difficultySelect = () => getEl('difficulty-select') as HTMLSelectElement;
export const wishesInput = () => getEl('wishes-input') as HTMLInputElement;
export const draftNotification = () => getEl('draft-notification');
export const restoreDraftBtn = () => getEl('restore-draft-btn');
export const dismissDraftBtn = () => getEl('dismiss-draft-btn');
export const savedCountBadge = () => getEl('saved-count-badge');
export const loadingIndicator = () => getEl('loading-overlay');
export const recipeOutput = () => getEl('recipe-output');
export const savedRecipesList = () => getEl('saved-recipes-list');
export const shoppingListContent = () => getEl('shopping-list-content');

function startLoading(phase: string = "Der Chef bereitet vor...") {
    currentLoaderPhase = phase;
    const el = getEl('loader-msg');
    loadingIndicator()?.classList.remove('hidden');
    let i = 0;
    const LOADER_MSGS = [phase, "Gourmet-Ideen sammeln...", "Aromen komponieren...", "Zutaten sortieren..."];
    if (el) el.textContent = LOADER_MSGS[0];
    loadingInterval = window.setInterval(() => {
        i = (i + 1) % LOADER_MSGS.length;
        if (el) el.textContent = LOADER_MSGS[i];
    }, 2500);
}

function stopLoading() {
    currentLoaderPhase = "Standby";
    loadingIndicator()?.classList.add('hidden');
    if (loadingInterval) { clearInterval(loadingInterval); loadingInterval = null; }
}

async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
    let delay = 3000;
    for (let i = 0; i < maxRetries; i++) {
        try { return await operation(); } catch (error: any) {
            const errorStr = error?.message || String(error);
            const isRateLimit = errorStr.includes("429") || errorStr.includes("Quota");
            if (isRateLimit && i < maxRetries - 1) {
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; continue;
            }
            throw error;
        }
    }
    throw new Error("Server-Limit erreicht.");
}

async function callChef(payload: any) {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    logAction('AI_REQUEST_START', { type: payload.type });
    try {
        return await retryWithBackoff(async () => {
            if (payload.type === 'generate') {
                const response = await ai.models.generateContent({
                    model: 'gemini-3-pro-preview',
                    contents: { parts: [{ text: `Handele als Profi-Koch. Erstelle ein Rezept für: ${payload.prompt}. Schwierigkeit: ${payload.difficulty || 'leicht'}. Personen: ${payload.servings || 2}. Wünsche: ${payload.wishes || 'keine'}.` }] },
                    config: { 
                        responseMimeType: "application/json", 
                        responseSchema: recipeSchema,
                        systemInstruction: "Erstelle ein hochqualitatives, deutsches Gourmet-Rezept mit präzisen Mengenangaben und Nährwertschätzung."
                    },
                });
                return JSON.parse(response.text || "{}");
            } else if (payload.type === 'scan-to-recipe') {
                const response = await ai.models.generateContent({
                    model: 'gemini-3-flash-preview',
                    contents: { 
                        parts: [
                            { inlineData: { mimeType: payload.mimeType, data: payload.image } }, 
                            { text: "Welche Lebensmittel sind auf diesem Bild zu sehen? Falls nichts erkennbar ist, nenne den Grund." }
                        ] 
                    },
                    config: { 
                        responseMimeType: "application/json", 
                        responseSchema: combinedScanSchema,
                        systemInstruction: "Du bist ein Experte für die Erkennung von Lebensmitteln und Zutaten. Sei präzise. Falls das Bild unscharf oder zu dunkel ist, gib dies als Grund an."
                    },
                });
                return JSON.parse(response.text || "{}");
            }
        });
    } catch (e: any) {
        logAction('AI_EXCEPTION', { error: e.message });
        showToast("Fehler bei der KI-Anfrage.", "error");
        return null;
    }
}

// --- Shopping List Logic ---
export function getShoppingList(): ShoppingItem[] {
    const data = localStorage.getItem('shoppingList');
    try { return data ? JSON.parse(data) : []; } catch { return []; }
}

export function saveShoppingList(list: ShoppingItem[]) {
    localStorage.setItem('shoppingList', JSON.stringify(list));
    renderShoppingList();
}

export function addToShoppingList(items: string[]) {
    const current = getShoppingList();
    items.forEach(text => {
        if (!current.some(item => item.text.toLowerCase() === text.toLowerCase())) {
            current.push({ id: Math.random().toString(36).substr(2, 9), text, completed: false });
        }
    });
    saveShoppingList(current);
}

export function toggleShoppingItem(id: string) {
    const list = getShoppingList();
    const item = list.find(i => i.id === id);
    if (item) {
        item.completed = !item.completed;
        saveShoppingList(list);
    }
}

export function renderShoppingList() {
    const container = shoppingListContent();
    if (!container) return;
    const list = getShoppingList();
    if (list.length === 0) {
        container.innerHTML = '<p class="empty-state">Deine Liste ist leer.</p>';
        return;
    }
    container.innerHTML = '';
    list.forEach(item => {
        const div = document.createElement('div');
        div.className = `glass-card saved-item shopping-item ${item.completed ? 'completed' : ''}`;
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; flex:1;">
                <div class="checkbox ${item.completed ? 'checked' : ''}"></div>
                <span style="${item.completed ? 'text-decoration: line-through; opacity: 0.6;' : ''}">${item.text}</span>
            </div>
        `;
        div.onclick = () => toggleShoppingItem(item.id);
        container.appendChild(div);
    });
}

// --- Recipe Scaling ---
export function scaleIngredientLine(line: string, fromS: number, toS: number): string {
    if (!fromS || !toS || fromS === toS) return line;
    const factor = toS / fromS;
    return line.replace(/(\d+(?:[.,]\d+)?)/g, (match) => {
        const hasComma = match.includes(',');
        const num = parseFloat(match.replace(',', '.'));
        if (isNaN(num)) return match;
        const scaled = num * factor;
        let formatted = scaled.toFixed(1).replace(/\.0$/, "");
        if (hasComma) formatted = formatted.replace('.', ',');
        return formatted;
    });
}

export function updateIngredientQuantities() {
    if (currentDisplayedRecipe) {
        const newS = parseInt(servingsInput().value);
        const list = getEl('active-ing-list');
        if (list && !isNaN(newS) && newS > 0) {
            const scaled = currentDisplayedRecipe.ingredients.map(ing => scaleIngredientLine(ing, currentDisplayedRecipe!.servings, newS));
            list.innerHTML = scaled.map(i => `<li>${i}</li>`).join('');
            const disp = getEl('servings-display');
            if (disp) disp.textContent = newS.toString();
        }
    }
}

// --- Draft Logic ---
export function saveDraft() {
    const p = promptInput()?.value;
    if (p && p.trim()) {
        localStorage.setItem('recipeDraft', JSON.stringify({
            prompt: p,
            difficulty: difficultySelect()?.value,
            servings: servingsInput()?.value,
            wishes: wishesInput()?.value
        }));
    } else {
        localStorage.removeItem('recipeDraft');
    }
}

export function clearDraft() {
    localStorage.removeItem('recipeDraft');
    draftNotification()?.classList.add('hidden');
}

export function checkForDraft() {
    const draft = localStorage.getItem('recipeDraft');
    if (draft) {
        draftNotification()?.classList.remove('hidden');
    }
}

// --- UI Rendering ---
function renderRecipeOutput(r: Recipe) {
    currentDisplayedRecipe = r;
    const out = recipeOutput();
    if (!out) return;

    const nutritionHtml = r.nutrition ? `
        <div class="nutrition-grid">
            <div class="nutri-item"><label>kcal</label><span>${r.nutrition.calories}</span></div>
            <div class="nutri-item"><label>Prot</label><span>${r.nutrition.protein}</span></div>
            <div class="nutri-item"><label>Carb</label><span>${r.nutrition.carbs}</span></div>
            <div class="nutri-item"><label>Fett</label><span>${r.nutrition.fat}</span></div>
        </div>
    ` : '';

    out.innerHTML = `
        <div class="glass-card animate-in recipe-card" style="margin-top:20px;">
            <h2 class="recipe-title">${r.recipeName}</h2>
            <p class="recipe-desc">${r.description}</p>
            ${nutritionHtml}
            <div class="recipe-content">
                <h4>Zutaten (<span id="servings-display">${r.servings}</span> Personen)</h4>
                <ul class="ing-list" id="active-ing-list">${r.ingredients.map(i => `<li>${i}</li>`).join('')}</ul>
                <h4 style="margin-top:20px;">Zubereitung</h4>
                <div class="instr-text">${r.instructions.join('<br><br>')}</div>
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="primary-btn" id="save-recipe-btn" style="flex:1;">📖 Speichern</button>
                <button class="flat-btn" id="add-to-list-btn">🛒 Liste</button>
            </div>
        </div>
    `;

    getEl('save-recipe-btn')?.addEventListener('click', () => {
        if (saveRecipeToStorage({ ...r, id: r.id || Math.random().toString(36).substr(2, 9), createdAt: Date.now() })) {
            showToast("Gespeichert!"); confetti({ particleCount: 100 });
        }
    });

    getEl('add-to-list-btn')?.addEventListener('click', () => {
        addToShoppingList(r.ingredients);
        showToast("Auf der Liste!");
    });
    out.scrollIntoView({ behavior: 'smooth' });
}

// --- Storage Logic ---
export function getSavedRecipes(): Recipe[] {
    const data = localStorage.getItem('savedRecipes');
    try { return data ? JSON.parse(data) : []; } catch { return []; }
}
export function saveRecipeToStorage(r: Recipe): boolean {
    const saved = getSavedRecipes();
    if (saved.some(sr => sr.recipeName === r.recipeName)) {
        if (!confirm("Überschreiben?")) return false;
        const index = saved.findIndex(sr => sr.recipeName === r.recipeName);
        saved[index] = r;
    } else { saved.push(r); }
    localStorage.setItem('savedRecipes', JSON.stringify(saved));
    updateSavedCount();
    return true;
}
export function removeRecipeFromStorage(name: string) {
    const saved = getSavedRecipes();
    const filtered = saved.filter(r => r.recipeName.toLowerCase() !== name.toLowerCase());
    localStorage.setItem('savedRecipes', JSON.stringify(filtered));
    updateSavedCount(); renderSavedRecipes();
}
export function updateSavedCount() {
    const saved = getSavedRecipes();
    const badge = savedCountBadge();
    if (badge) {
        badge.textContent = saved.length ? saved.length.toString() : "";
        badge.classList.toggle('hidden', saved.length === 0);
    }
}
export function renderSavedRecipes() {
    const list = savedRecipesList();
    if (!list) return;
    const saved = getSavedRecipes();
    list.innerHTML = saved.length ? '' : '<p class="empty-state">Dein Kochbuch ist leer.</p>';
    saved.forEach(r => {
        const card = document.createElement('div');
        card.className = 'glass-card saved-item';
        card.innerHTML = `<div><h4>${r.recipeName}</h4><small>${r.servings} Personen</small></div><button class="del-btn">🗑️</button>`;
        card.onclick = () => renderRecipeOutput(r);
        card.querySelector('.del-btn')?.addEventListener('click', (e) => {
            e.stopPropagation(); if (confirm("Löschen?")) removeRecipeFromStorage(r.recipeName);
        });
        list.appendChild(card);
    });
}

// --- Initialization ---
function init() {
    checkForDraft();

    servingsInput()?.addEventListener('input', () => {
        updateIngredientQuantities();
        saveDraft();
    });

    promptInput()?.addEventListener('input', () => saveDraft());
    difficultySelect()?.addEventListener('change', () => saveDraft());
    wishesInput()?.addEventListener('input', () => saveDraft());

    restoreDraftBtn()?.addEventListener('click', () => {
        const draftStr = localStorage.getItem('recipeDraft');
        if (draftStr) {
            try {
                const draft = JSON.parse(draftStr);
                if (promptInput()) promptInput().value = draft.prompt || '';
                if (difficultySelect()) difficultySelect().value = draft.difficulty || 'leicht';
                if (servingsInput()) servingsInput().value = draft.servings || '2';
                if (wishesInput()) wishesInput().value = draft.wishes || '';
                showToast("Entwurf wiederhergestellt");
            } catch (e) {
                console.error("Fehler beim Laden des Entwurfs", e);
            }
        }
        draftNotification()?.classList.add('hidden');
    });

    dismissDraftBtn()?.addEventListener('click', () => {
        clearDraft();
    });

    getEl('btn-generate')?.addEventListener('click', async () => {
        const p = promptInput()?.value;
        if (!p) return showToast("Bitte gib etwas ein!");
        startLoading("Der Chef kreiert dein Rezept...");
        const recipe = await callChef({ 
            type: 'generate', 
            prompt: p, 
            difficulty: difficultySelect()?.value, 
            servings: servingsInput()?.value, 
            wishes: wishesInput()?.value 
        });
        stopLoading();
        if (recipe) {
            renderRecipeOutput(recipe);
            clearDraft();
        }
    });

    getEl('btn-crop-confirm')?.addEventListener('click', async () => {
        if (!currentCropper) return;
        startLoading("Chef analysiert das Bild...");
        try {
            const canvas = currentCropper.getCroppedCanvas({ maxWidth: 1024, maxHeight: 1024 });
            const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
            const data = await callChef({ type: 'scan-to-recipe', image: base64, mimeType: 'image/jpeg' });
            stopLoading();
            if (data?.isReadable) {
                currentIngredients = data.ingredients || [];
                promptInput().value = currentIngredients.join(', ');
                saveDraft();
                document.querySelectorAll('.layer').forEach(l => l.classList.add('hidden'));
                getEl('btn-generate')?.click();
            } else { 
                showToast(data?.unreadableReason || "Bild nicht lesbar. Bitte näher herangehen.", "error"); 
            }
        } catch (e) {
            stopLoading();
            showToast("Fehler bei der Bildanalyse.", "error");
        }
    });

    const handleFile = (file: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast("Bitte nur Bilder hochladen", "error");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = getEl('cropper-img') as HTMLImageElement;
            img.src = e.target?.result as string;
            
            // Wait for image to load before initializing cropper
            img.onload = () => {
                getEl('modal-scanner')?.classList.add('hidden');
                getEl('modal-cropper')?.classList.remove('hidden');
                if (currentCropper) currentCropper.destroy();
                currentCropper = new Cropper(img, { 
                    aspectRatio: 1, 
                    viewMode: 1,
                    dragMode: 'move',
                    autoCropArea: 0.8,
                    restore: false,
                    guides: true,
                    center: true,
                    highlight: false,
                    cropBoxMovable: true,
                    cropBoxResizable: true,
                    toggleDragModeOnDblclick: false,
                });
            };
        };
        reader.onerror = () => showToast("Fehler beim Lesen der Datei", "error");
        reader.readAsDataURL(file);
    };

    getEl('input-camera')?.addEventListener('change', (e: any) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
        e.target.value = '';
    });

    getEl('input-gallery')?.addEventListener('change', (e: any) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
        e.target.value = '';
    });

    getEl('fab-scan')?.addEventListener('click', () => getEl('modal-scanner')?.classList.remove('hidden'));
    
    getEl('btn-clear-list')?.addEventListener('click', () => {
        if (confirm("Möchtest du die Einkaufsliste wirklich leeren?")) saveShoppingList([]);
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = (e.currentTarget as HTMLElement).dataset.tab!;
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            getEl(tabId)?.classList.add('active');
            (e.currentTarget as HTMLElement).classList.add('active');
            if (tabId === 'tab-book') renderSavedRecipes();
            if (tabId === 'tab-shopping') renderShoppingList();
        });
    });

    document.querySelectorAll('.close-layer').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.layer').forEach(l => l.classList.add('hidden'));
            if (currentCropper) {
                currentCropper.destroy();
                currentCropper = null;
            }
        });
    });

    updateSavedCount();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }