
import { GoogleGenAI, Type } from "@google/genai";

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

// --- Configuration ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Schemas ---
const recipeSchema = {
  type: Type.OBJECT,
  properties: {
    recipeName: {
      type: Type.STRING,
      description: "Der Name des Rezepts."
    },
    description: {
        type: Type.STRING,
        description: "Eine kurze, ansprechende Beschreibung des Gerichts."
    },
    ingredients: {
      type: Type.ARRAY,
      description: "Eine Liste der Zutaten, die für das Rezept benötigt werden. Starte jede Zeile mit der Menge und Einheit (z.B. '500g Nudeln').",
      items: { type: Type.STRING }
    },
    instructions: {
      type: Type.ARRAY,
      description: "Eine schrittweise Anleitung zur Zubereitung des Gerichts.",
      items: { type: Type.STRING }
    },
  },
  required: ["recipeName", "description", "ingredients", "instructions"],
};

const ocrSchema = {
    type: Type.OBJECT,
    properties: {
        isReadable: {
            type: Type.BOOLEAN,
            description: "Gibt an, ob der Text auf dem Bild insgesamt lesbar war."
        },
        unreadableReason: {
            type: Type.STRING,
            description: "Optionaler Grund, warum das Bild nicht lesbar war (z.B. 'verschwommen', 'handschriftlich')."
        },
        recipeName: {
            type: Type.STRING,
            description: "Der Name des Gerichts, wenn auf dem Bild erkennbar."
        },
        ingredients: {
            type: Type.ARRAY,
            description: "Eine Liste der auf dem Bild erkannten Zutaten.",
            items: { type: Type.STRING }
        },
        instructions: {
            type: Type.ARRAY,
            description: "Eine Liste der auf dem Bild erkannten Zubereitungsschritte.",
            items: { type: Type.STRING }
        }
    },
    required: ["isReadable"]
};

// --- Type Definition ---
interface Recipe {
    recipeName: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    imageUrl?: string;
    servings: number;
}

interface RecipeDraft {
    prompt: string;
    difficulty: string;
    wishes: string;
    servings: number;
}

// --- DOM Element References ---
// Export these for testing purposes so they can be mocked
export const recipeForm = document.getElementById('recipe-form') as HTMLFormElement;
export const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
export const difficultySelect = document.getElementById('difficulty-select') as HTMLSelectElement;
export const servingsInput = document.getElementById('servings-input') as HTMLInputElement;
export const wishesInput = document.getElementById('wishes-input') as HTMLTextAreaElement;
export const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
export const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;
export const loadingIndicatorSpan = document.querySelector('#loading-indicator span') as HTMLSpanElement;
export const recipeOutput = document.getElementById('recipe-output') as HTMLDivElement;
export const recipeActionsContainer = document.getElementById('recipe-actions-container') as HTMLDivElement;
export const viewSavedBtn = document.getElementById('view-saved-btn') as HTMLButtonElement;
export const savedCountBadge = document.getElementById('saved-count-badge') as HTMLSpanElement;
export const themeToggle = document.getElementById('theme-toggle') as HTMLInputElement;
export const ocrButton = document.getElementById('ocr-button') as HTMLButtonElement;
export const ocrInput = document.getElementById('ocr-input') as HTMLInputElement;
export const draftNotification = document.getElementById('draft-notification') as HTMLDivElement;
export const restoreDraftBtn = document.getElementById('restore-draft-btn') as HTMLButtonElement;
export const dismissDraftBtn = document.getElementById('dismiss-draft-btn') as HTMLButtonElement;


// Browse Recipes Modal
export const browseRecipesBtn = document.getElementById('browse-recipes-btn') as HTMLButtonElement;
export const browseRecipesModal = document.getElementById('browse-recipes-modal') as HTMLDivElement;
export const closeBrowseModalBtn = document.getElementById('close-browse-modal-btn') as HTMLButtonElement;
export const browseRecipesList = document.getElementById('browse-recipes-list') as HTMLDivElement;

// Saved Recipes Modal
export const savedRecipesModal = document.getElementById('saved-recipes-modal') as HTMLDivElement;
// Fix: Corrected type from HTMLButtonButtonElement to HTMLButtonElement
export const closeModalBtn = document.getElementById('close-modal-btn') as HTMLButtonElement;
export const savedRecipesList = document.getElementById('saved-recipes-list') as HTMLDivElement;
export const savedRecipesSearchInput = document.getElementById('saved-recipes-search') as HTMLInputElement;

// Add Recipe Modal
export const addRecipeBtn = document.getElementById('add-recipe-btn') as HTMLButtonElement;
export const addRecipeModal = document.getElementById('add-recipe-modal') as HTMLDivElement;
export const closeAddModalBtn = document.getElementById('close-add-modal-btn') as HTMLButtonElement;
export const addRecipeForm = document.getElementById('add-recipe-form') as HTMLFormElement;
export const addRecipeNameInput = document.getElementById('add-recipe-name') as HTMLInputElement;
export const addRecipeDescriptionTextarea = document.getElementById('add-recipe-description') as HTMLTextAreaElement;
export const addRecipeIngredientsTextarea = document.getElementById('add-recipe-ingredients') as HTMLTextAreaElement;
export const addRecipeInstructionsTextarea = document.getElementById('add-recipe-instructions') as HTMLTextAreaElement;
export const addRecipeImageInput = document.getElementById('add-recipe-image') as HTMLInputElement;
export const importFromImageBtn = document.getElementById('import-from-image-btn') as HTMLButtonElement;
export const importImageInput = document.getElementById('import-image-input') as HTMLInputElement;


// --- State ---
let currentRecipe: Recipe | null = null;
const DRAFT_KEY = 'recipeDraft';

// --- Sample Data ---
const sampleRecipeIdeas = [
    "Schnelle Tomaten-Mozzarella-Nudeln",
    "Hähnchen-Curry mit Reis",
    "Vegetarische Linsen-Bolognese",
    "Einfacher Grießbrei mit Früchten",
    "Kartoffel-Lauch-Suppe",
    "Wraps mit Hähnchen und Gemüse",
    "Pfannkuchen mit Apfelmus",
    "Thunfischsalat-Sandwich",
    "One-Pot-Pasta mit Spinat und Feta",
    "Gebratener Reis mit Ei und Gemüse"
];

// --- Helper Functions ---
export function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Compresses and resizes an image file to a smaller DataURL.
 * Vital for localStorage limits and network payload optimization.
 */
export function compressImage(file: File, maxWidth: number = 1024, quality: number = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Resize logic
                if (width > maxWidth) {
                    height *= maxWidth / width;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Could not get canvas context"));
                    return;
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                // Return as JPEG to save space (PNG is often larger for photos)
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = (error) => reject(error);
        };
        reader.onerror = (error) => reject(error);
    });
}

/**
 * Scales a single ingredient string based on the ratio of newServings / originalServings.
 * It looks for a number at the start of the string (e.g., "500g", "0.5l", "2 EL").
 */
export function scaleIngredientLine(line: string, originalServings: number, newServings: number): string {
    // Regex to find leading numbers. Handles:
    // 500
    // 0.5 or 0,5
    // 1 1/2 (simplified to looking for the first number block)
    const regex = /^([\d.,]+)(\s.*)$/;
    const match = line.match(regex);
    
    if (match) {
        const numberPart = match[1].replace(',', '.'); // Normalize German comma
        const textPart = match[2];
        const originalAmount = parseFloat(numberPart);

        if (!isNaN(originalAmount)) {
            const newAmount = (originalAmount / originalServings) * newServings;
            
            // Format: Remove trailing zeros, max 2 decimals. Replace dot with comma for German output.
            const formattedAmount = parseFloat(newAmount.toFixed(2)).toString().replace('.', ',');
            return `${formattedAmount}${textPart}`;
        }
    }
    return line; // Return original if no number found
}

export function updateIngredientQuantities(originalRecipe: Recipe, newServings: number): string[] {
    if (!originalRecipe.servings) return originalRecipe.ingredients; // Safety check
    
    return originalRecipe.ingredients.map(line => 
        scaleIngredientLine(line, originalRecipe.servings, newServings)
    );
}


// --- Draft Functions ---
export function saveDraft() {
    if (promptInput.value.trim()) {
        const draft: RecipeDraft = {
            prompt: promptInput.value,
            difficulty: difficultySelect.value,
            wishes: wishesInput.value,
            servings: parseInt(servingsInput.value) || 2
        };
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } else {
        clearDraft();
    }
}

export function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
}

export function checkForDraft() {
    const draftJSON = localStorage.getItem(DRAFT_KEY);
    if (draftJSON) {
        const draft: RecipeDraft = JSON.parse(draftJSON);
        draftNotification.classList.remove('hidden');

        restoreDraftBtn.addEventListener('click', () => {
            promptInput.value = draft.prompt;
            difficultySelect.value = draft.difficulty;
            wishesInput.value = draft.wishes;
            servingsInput.value = (draft.servings || 2).toString();
            draftNotification.classList.add('hidden');
        });

        dismissDraftBtn.addEventListener('click', () => {
            clearDraft();
            draftNotification.classList.add('hidden');
        });
    }
}


// --- LocalStorage Functions ---
export function getSavedRecipes(): Recipe[] {
    const recipesJSON = localStorage.getItem('savedRecipes');
    return recipesJSON ? JSON.parse(recipesJSON) : [];
}

export function saveRecipeToStorage(recipe: Recipe): boolean {
    try {
        const recipes = getSavedRecipes();
        if (recipes.some(r => r.recipeName.toLowerCase() === recipe.recipeName.toLowerCase())) {
            alert("Ein Rezept mit diesem Namen existiert bereits.");
            return false;
        }
        recipes.push(recipe);
        localStorage.setItem('savedRecipes', JSON.stringify(recipes));
        updateSavedCount();
        return true;
    } catch (error) {
        console.error("Fehler beim Speichern:", error);
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            alert("Speicherplatz voll! Das Rezept (oder das Bild) ist zu groß für den lokalen Speicher. Bitte lösche alte Rezepte oder verwende ein kleineres Bild.");
        } else {
            alert("Fehler beim Speichern des Rezepts.");
        }
        return false;
    }
}

export function updateRecipeInStorage(originalRecipeName: string, updatedRecipe: Recipe) {
    try {
        let recipes = getSavedRecipes();
        const recipeIndex = recipes.findIndex(r => r.recipeName.toLowerCase() === originalRecipeName.toLowerCase());
        if (recipeIndex > -1) {
            recipes[recipeIndex] = updatedRecipe;
            localStorage.setItem('savedRecipes', JSON.stringify(recipes));
            updateSavedCount();
            renderSavedRecipes(); // Re-render implicitly with full list
        }
    } catch (error) {
         console.error("Fehler beim Aktualisieren:", error);
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
            alert("Speicherplatz voll! Die Änderungen konnten nicht gespeichert werden, da der Speicher voll ist.");
        } else {
            alert("Fehler beim Aktualisieren des Rezepts.");
        }
    }
}


export function removeRecipeFromStorage(recipeName: string) {
    let recipes = getSavedRecipes();
    recipes = recipes.filter(r => r.recipeName !== recipeName);
    localStorage.setItem('savedRecipes', JSON.stringify(recipes));
    updateSavedCount();
    renderSavedRecipes(); // Re-render implicitly with full list
}

export function isRecipeSaved(recipeName: string): boolean {
    const recipes = getSavedRecipes();
    return recipes.some(r => r.recipeName.toLowerCase() === recipeName.toLowerCase());
}


// --- UI Update Functions ---
export function setLoading(isLoading: boolean, message: string = 'Kocht ein leckeres Rezept für dich...') {
    generateButton.disabled = isLoading;
    ocrButton.disabled = isLoading;
    const saveEditBtn = document.getElementById('save-edit-btn') as HTMLButtonElement | null;
    if (saveEditBtn) {
        saveEditBtn.disabled = isLoading;
    }
    loadingIndicator.classList.toggle('hidden', !isLoading);
    if (loadingIndicatorSpan) {
        loadingIndicatorSpan.textContent = message;
    }
    if (isLoading) {
        recipeOutput.style.opacity = '0.5';
        recipeActionsContainer.classList.add('hidden');
    } else {
        recipeOutput.style.opacity = '1';
    }
}

export function renderRecipe(recipe: Recipe | null) {
    if (!recipe) {
        recipeOutput.innerHTML = '';
        recipeActionsContainer.innerHTML = '';
        recipeActionsContainer.classList.add('hidden');
        return;
    }

    // Ensure servings is set (backfill for old data)
    if (!recipe.servings) {
        recipe.servings = 4; // Default for old recipes
    }

    const originalRecipeForUpdate = { ...recipe }; // Deep copy for editing/reverting
    // Deep copy for current state tracking (including servings adjustments)
    currentRecipe = JSON.parse(JSON.stringify(recipe)); 
    
    const isSaved = isRecipeSaved(recipe.recipeName);

    recipeOutput.innerHTML = `
        <div class="recipe-card">
            ${recipe.imageUrl ? `<img src="${recipe.imageUrl}" alt="${recipe.recipeName}" class="recipe-image">` : ''}
             <div id="recipe-display">
                <div class="recipe-header-row">
                    <h2>${recipe.recipeName}</h2>
                    <div class="servings-control">
                        <button class="servings-btn" id="decrease-servings">-</button>
                        <div class="servings-display">
                            <span id="servings-count">${recipe.servings}</span>
                            <span class="servings-label">Portionen</span>
                        </div>
                        <button class="servings-btn" id="increase-servings">+</button>
                    </div>
                </div>
                <p class="description">${recipe.description}</p>
                <div class="recipe-details">
                    <div class="ingredients">
                        <h3>Zutaten</h3>
                        <ul id="ingredients-list">
                            ${recipe.ingredients.map(i => `<li>${i}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="instructions">
                        <h3>Anleitung</h3>
                        <ol>
                            ${recipe.instructions.map(i => `<li>${i}</li>`).join('')}
                        </ol>
                    </div>
                </div>
            </div>

            <div id="recipe-edit-form" class="hidden">
                 <div class="form-group">
                    <label for="edit-recipe-name">Rezeptname</label>
                    <input type="text" id="edit-recipe-name" value="${recipe.recipeName.replace(/"/g, '&quot;')}">
                </div>
                 <div class="form-group">
                    <label for="edit-recipe-description">Beschreibung</label>
                    <textarea id="edit-recipe-description" rows="3">${recipe.description}</textarea>
                </div>
                 <div class="form-group">
                    <label for="edit-recipe-ingredients">Zutaten (eine pro Zeile)</label>
                    <textarea id="edit-recipe-ingredients" rows="5">${recipe.ingredients.join('\n')}</textarea>
                </div>
                 <div class="form-group">
                    <label for="edit-recipe-instructions">Anleitung (ein Schritt pro Zeile)</label>
                    <textarea id="edit-recipe-instructions" rows="7">${recipe.instructions.join('\n')}</textarea>
                </div>
                 <div class="form-group">
                    <label for="edit-recipe-image">Foto ändern (optional)</label>
                    <input type="file" id="edit-recipe-image" accept="image/*">
                </div>
            </div>
        </div>
    `;

    recipeActionsContainer.innerHTML = `
        <button id="save-recipe-btn" ${isSaved ? 'disabled' : ''}>
            ${isSaved ? 'Gespeichert' : 'Rezept speichern'}
        </button>
        <button id="edit-recipe-btn">Rezept bearbeiten</button>
        <button id="share-recipe-btn">Rezept teilen</button>
        <button id="save-edit-btn" class="hidden">Änderungen speichern</button>
        <button id="cancel-edit-btn" class="hidden secondary-btn">Abbrechen</button>
    `;
    recipeActionsContainer.classList.remove('hidden');
    
    // Element References
    const saveRecipeBtn = document.getElementById('save-recipe-btn') as HTMLButtonElement;
    const editRecipeBtn = document.getElementById('edit-recipe-btn') as HTMLButtonElement;
    const saveEditBtn = document.getElementById('save-edit-btn') as HTMLButtonElement;
    const cancelEditBtn = document.getElementById('cancel-edit-btn') as HTMLButtonElement;
    const shareRecipeBtn = document.getElementById('share-recipe-btn') as HTMLButtonElement;
    const recipeDisplay = document.getElementById('recipe-display') as HTMLDivElement;
    const recipeEditForm = document.getElementById('recipe-edit-form') as HTMLDivElement;
    
    // Servings controls
    const decreaseServingsBtn = document.getElementById('decrease-servings') as HTMLButtonElement;
    const increaseServingsBtn = document.getElementById('increase-servings') as HTMLButtonElement;
    const servingsCountSpan = document.getElementById('servings-count') as HTMLSpanElement;
    const ingredientsListUl = document.getElementById('ingredients-list') as HTMLUListElement;

    // Servings Logic
    const updateServingsDisplay = (newServings: number) => {
        if (newServings < 1) return;
        if (!currentRecipe) return;

        // Calculate new ingredients
        const newIngredients = updateIngredientQuantities(originalRecipeForUpdate, newServings);
        
        // Update DOM
        servingsCountSpan.textContent = newServings.toString();
        ingredientsListUl.innerHTML = newIngredients.map(i => `<li>${i}</li>`).join('');

        // Update Current State (so saving uses the scaled version)
        currentRecipe.servings = newServings;
        currentRecipe.ingredients = newIngredients;
    };

    decreaseServingsBtn?.addEventListener('click', () => {
        if (currentRecipe && currentRecipe.servings > 1) {
            updateServingsDisplay(currentRecipe.servings - 1);
        }
    });

    increaseServingsBtn?.addEventListener('click', () => {
        if (currentRecipe) {
            updateServingsDisplay(currentRecipe.servings + 1);
        }
    });


    // Event Listeners
    saveRecipeBtn?.addEventListener('click', () => {
        if (currentRecipe) {
            if (saveRecipeToStorage(currentRecipe)) {
                saveRecipeBtn.disabled = true;
                saveRecipeBtn.textContent = 'Gespeichert';
            }
        }
    });

    editRecipeBtn?.addEventListener('click', () => {
        recipeDisplay.classList.add('hidden');
        recipeEditForm.classList.remove('hidden');
        editRecipeBtn.classList.add('hidden');
        saveRecipeBtn.classList.add('hidden');
        shareRecipeBtn.classList.add('hidden');
        saveEditBtn.classList.remove('hidden');
        cancelEditBtn.classList.remove('hidden');
    });

    cancelEditBtn?.addEventListener('click', () => {
        renderRecipe(originalRecipeForUpdate);
    });

    shareRecipeBtn?.addEventListener('click', async () => {
        if (currentRecipe) {
            const ingredientsText = currentRecipe.ingredients.map(i => `- ${i}`).join('\n');
            const instructionsText = currentRecipe.instructions.map((instr, index) => `${index + 1}. ${instr}`).join('\n');

            // Generate a user-friendly text summary
            const shareText = `🍳 Rezept: ${currentRecipe.recipeName} (für ${currentRecipe.servings} Portionen)\n\n${currentRecipe.description}\n\n---\n\n🛒 Zutaten:\n${ingredientsText}\n\n---\n\n👨‍🍳 Anleitung:\n${instructionsText}`;

            // Use Web Share API if available
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: `Rezept: ${currentRecipe.recipeName}`,
                        text: shareText,
                    });
                } catch (err) {
                    console.log('Web Share API error:', err);
                }
            } else {
                // Fallback to clipboard
                try {
                    await navigator.clipboard.writeText(shareText);
                    const originalText = shareRecipeBtn.textContent;
                    shareRecipeBtn.textContent = 'Kopiert!';
                    shareRecipeBtn.disabled = true;
                    setTimeout(() => {
                        shareRecipeBtn.textContent = originalText;
                        shareRecipeBtn.disabled = false;
                    }, 2000);
                } catch (err) {
                    console.error('Fehler beim Kopieren des Rezepts: ', err);
                    alert('Das Rezept konnte nicht kopiert werden.');
                }
            }
        }
    });

    saveEditBtn?.addEventListener('click', async () => {
        const imageInput = document.getElementById('edit-recipe-image') as HTMLInputElement;
        const imageFile = imageInput.files?.[0];
        let imageUrl = originalRecipeForUpdate.imageUrl; // Keep old image by default

        if (imageFile) {
            if (!imageFile.type.startsWith('image/')) {
                alert('Ungültiges Dateiformat für das Rezeptbild. Bitte lade ein Bild (z.B. JPG, PNG) hoch.');
                return;
            }
            try {
                // USE COMPRESSION
                imageUrl = await compressImage(imageFile, 800, 0.7);
            } catch (error) {
                console.error("Fehler beim Lesen der Bilddatei:", error);
                alert("Beim Lesen des Rezeptbildes ist ein Fehler aufgetreten. Bitte versuche es mit einer anderen Datei.");
                return; // Stop if image processing fails
            }
        }

        const updatedRecipe: Recipe = {
            recipeName: (document.getElementById('edit-recipe-name') as HTMLInputElement).value.trim(),
            description: (document.getElementById('edit-recipe-description') as HTMLTextAreaElement).value.trim(),
            ingredients: (document.getElementById('edit-recipe-ingredients') as HTMLTextAreaElement).value.split('\n').map(i => i.trim()).filter(i => i !== ''),
            instructions: (document.getElementById('edit-recipe-instructions') as HTMLTextAreaElement).value.split('\n').map(i => i.trim()).filter(i => i !== ''),
            imageUrl: imageUrl,
            servings: currentRecipe?.servings || 4 // Preserve current servings count
        };
        
        // If the name changed, we need to check if the new name already exists
        if (updatedRecipe.recipeName.toLowerCase() !== originalRecipeForUpdate.recipeName.toLowerCase() && isRecipeSaved(updatedRecipe.recipeName)) {
             alert("Ein Rezept mit diesem neuen Namen existiert bereits.");
             return;
        }

        updateRecipeInStorage(originalRecipeForUpdate.recipeName, updatedRecipe);
        renderRecipe(updatedRecipe);
    });
}

export function renderError(message: string) {
    recipeOutput.innerHTML = `<div class="error-message">${message}</div>`;
}

export function updateSavedCount() {
    const count = getSavedRecipes().length;
    if (count > 0) {
        savedCountBadge.textContent = String(count);
        savedCountBadge.classList.remove('hidden');
    } else {
        savedCountBadge.classList.add('hidden');
    }
}

export function renderSavedRecipes(recipesToRender?: Recipe[]) {
    // If no specific list is passed, get all from storage
    const recipes = recipesToRender || getSavedRecipes();
    
    savedRecipesList.innerHTML = '';
    if (recipes.length === 0) {
        const isSearchActive = savedRecipesSearchInput && savedRecipesSearchInput.value.trim() !== '';
        if (isSearchActive && getSavedRecipes().length > 0) {
             savedRecipesList.innerHTML = '<p class="no-saved-recipes">Keine Rezepte gefunden.</p>';
        } else {
             savedRecipesList.innerHTML = '<p class="no-saved-recipes">Du hast noch keine Rezepte gespeichert.</p>';
        }
        return;
    }

    recipes.forEach(recipe => {
        const item = document.createElement('div');
        item.classList.add('saved-recipe-item');
        item.innerHTML = `
            ${recipe.imageUrl ? `<img src="${recipe.imageUrl}" alt="${recipe.recipeName}" class="saved-recipe-thumbnail">` : '<div class="saved-recipe-thumbnail-placeholder">🍳</div>'}
            <div class="saved-recipe-details">
                <h4>${recipe.recipeName}</h4>
                <p>${recipe.description}</p>
            </div>
            <div>
                <button class="view-btn">Ansehen</button>
                <button class="delete-btn">Löschen</button>
            </div>
        `;

        item.querySelector('.view-btn')?.addEventListener('click', () => {
            renderRecipe(recipe);
            savedRecipesModal.classList.add('hidden');
        });
        item.querySelector('.delete-btn')?.addEventListener('click', () => {
            if (confirm(`Möchtest du das Rezept "${recipe.recipeName}" wirklich löschen?`)) {
                removeRecipeFromStorage(recipe.recipeName);
            }
        });
        savedRecipesList.appendChild(item);
    });
}

function filterSavedRecipes() {
    const searchTerm = savedRecipesSearchInput.value.toLowerCase().trim();
    const allRecipes = getSavedRecipes();
    
    if (!searchTerm) {
        renderSavedRecipes(allRecipes);
        return;
    }

    const filtered = allRecipes.filter(recipe => 
        recipe.recipeName.toLowerCase().includes(searchTerm) ||
        recipe.ingredients.some(ing => ing.toLowerCase().includes(searchTerm))
    );
    
    renderSavedRecipes(filtered);
}

export function renderBrowseRecipes() {
    browseRecipesList.innerHTML = '';
    sampleRecipeIdeas.forEach(idea => {
        const item = document.createElement('button');
        item.classList.add('recipe-idea-btn');
        item.textContent = idea;
        item.addEventListener('click', () => {
            promptInput.value = idea;
            browseRecipesModal.classList.add('hidden');
            recipeForm.dispatchEvent(new Event('submit', { cancelable: true }));
        });
        browseRecipesList.appendChild(item);
    });
}


// --- Gemini Function ---
async function recognizeTextFromImage(file: File) {
    setLoading(true, 'Analysiere Bild...');
    renderError(''); // Clear previous errors

    if (!file.type.startsWith('image/')) {
        renderError('Ungültiges Dateiformat. Bitte lade ein Bild (z.B. JPG, PNG) hoch.');
        setLoading(false);
        ocrInput.value = '';
        return;
    }

    try {
        // Use compression before sending to API to reduce payload size and speed up transfer
        // 1024px is usually enough for OCR
        const base64Image = await compressImage(file, 1024, 0.8);
        const image = base64Image.split(',')[1]; // Remove the data URI prefix

        const prompt = `
            Analysiere das folgende Bild eines Rezepts. Das Bild enthält wahrscheinlich **handschriftlichen Text**, der in Schreibschrift oder Druckbuchstaben verfasst sein kann. Das Bild könnte auch schlecht beleuchtet oder verschwommen sein.

            **Spezialanweisungen für Handschrift:**
            - Gib dein Bestes, um auch unklare Handschriften zu entziffern.
            - Konzentriere dich darauf, den Sinn und die wesentlichen Informationen (Zutaten, Schritte) zu erfassen, auch wenn einzelne Buchstaben schwer zu lesen sind.
            - Wenn ein Wort mehrdeutig ist, versuche, es aus dem Kontext des Rezepts zu erschließen. Priorisiere eine lesbare und plausible Interpretation gegenüber einer buchstabengetreuen, aber unsinnigen Transkription.

            **Allgemeine Anweisungen:**
            1. Wenn der Text trotz aller Bemühungen **völlig unleserlich** ist (z.B. durch extreme Unschärfe oder sehr unordentliche Schrift), setze 'isReadable' auf 'false' und gib im Feld 'unreadableReason' eine kurze Begründung an (z.B. 'handschriftlich unleserlich', 'stark verschwommen').
            2. Wenn das Rezept zumindest teilweise entziffert werden kann, setze 'isReadable' auf 'true' und extrahiere den Rezeptnamen, die Zutaten und die Anleitung so gut wie möglich.
            3. Lasse Felder leer, wenn die entsprechenden Informationen nicht auf dem Bild vorhanden sind oder nicht entziffert werden können.

            Gib die Antwort als einzelnes JSON-Objekt zurück, das dem bereitgestellten Schema entspricht. Gib keinen Markdown oder zusätzlichen Text aus.
        `;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: ocrSchema,
            },
        });

        const extractedData: { 
            isReadable: boolean; 
            unreadableReason?: string;
            recipeName?: string; 
            ingredients?: string[]; 
            instructions?: string[] 
        } = JSON.parse(result.text);

        if (!extractedData.isReadable) {
            const reason = extractedData.unreadableReason || 'Zu undeutlich';
            renderError(`Das Bild konnte nicht gelesen werden. Grund: ${reason}. Bitte versuche es mit einem klareren Foto.`);
            return;
        }


        let fieldsPopulated = false;

        if (extractedData.recipeName) {
            promptInput.value = extractedData.recipeName;
            fieldsPopulated = true;
        }

        let wishesText = '';
        if (extractedData.ingredients && extractedData.ingredients.length > 0) {
            wishesText += 'Zutaten:\n- ' + extractedData.ingredients.join('\n- ');
            fieldsPopulated = true;
        }
        if (extractedData.instructions && extractedData.instructions.length > 0) {
            if (wishesText) {
                wishesText += '\n\n';
            }
            wishesText += 'Anleitung:\n- ' + extractedData.instructions.join('\n- ');
            fieldsPopulated = true;
        }

        if (wishesText) {
            wishesInput.value = wishesText;
        }

        if (!fieldsPopulated) {
            renderError("Es konnten keine Rezeptdetails im Bild erkannt werden, obwohl es lesbar schien. Bitte versuche es mit einem anderen Bild.");
        }

    } catch (error) {
        console.error("Fehler bei der Bilderkennung:", error);
        // Distinguish between file reading error and API error
        if (error instanceof DOMException && error.name === 'NotReadableError') {
             renderError('Beim Lesen der Bilddatei ist ein Fehler aufgetreten. Bitte versuche es mit einer anderen Datei.');
        } else {
            renderError(`Entschuldigung, bei der Analyse des Bildes ist ein Fehler aufgetreten. (${error.message})`);
        }
    } finally {
        setLoading(false);
        // Reset the file input so the user can select the same file again
        ocrInput.value = '';
    }
}

async function generateRecipe(event: Event) {
    event.preventDefault();
    if (!promptInput.value.trim()) {
        alert("Bitte gib ein, was du kochen möchtest.");
        return;
    }
    setLoading(true);
    renderError('');
    renderRecipe(null);

    try {
        const servings = parseInt(servingsInput.value) || 2;
        const prompt = `
        Erstelle ein einfaches und günstiges Rezept für Lehrlinge basierend auf den folgenden Angaben.
        Gib die Antwort als einzelnes JSON-Objekt zurück, das dem bereitgestellten Schema entspricht. Gib keinen Markdown oder zusätzlichen Text aus.

        Gericht: "${promptInput.value}"
        Schwierigkeitsgrad: "${difficultySelect.value}"
        Anzahl Portionen: ${servings}
        Zusätzliche Wünsche: "${wishesInput.value || 'Keine'}"
      `;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: recipeSchema,
            },
        });

        const recipe: Recipe = JSON.parse(result.text);
        // Force the servings from input onto the result, as the AI might imply it but we want to track it explicitly
        recipe.servings = servings;
        
        renderRecipe(recipe);
        clearDraft();
        recipeForm.reset();
        // Reset servings to default after generation
        servingsInput.value = "2"; 
    } catch (error) {
        console.error("Fehler bei der Rezeptgenerierung:", error);
        renderError(`Entschuldigung, bei der Erstellung des Rezepts ist ein Fehler aufgetreten. Bitte versuche es später erneut oder präzisiere deine Anfrage. (${error.message})`);
    } finally {
        setLoading(false);
    }
}

// --- Add Manual Recipe ---
async function handleModalImageImport(file: File) {
    const saveBtn = document.getElementById('save-manual-recipe-btn') as HTMLButtonElement;
    const originalImportText = importFromImageBtn.textContent;

    // Set loading state
    importFromImageBtn.disabled = true;
    saveBtn.disabled = true;
    importFromImageBtn.textContent = 'Analysiere...';

    if (!file.type.startsWith('image/')) {
        alert('Ungültiges Dateiformat. Bitte lade ein Bild (z.B. JPG, PNG) hoch.');
        importFromImageBtn.disabled = false;
        saveBtn.disabled = false;
        importFromImageBtn.textContent = originalImportText;
        importImageInput.value = '';
        return;
    }

    try {
        // Compress for OCR
        const base64Image = await compressImage(file, 1024, 0.8);
        const image = base64Image.split(',')[1];

        const prompt = `
            Analysiere das folgende Bild eines Rezepts. Das Bild enthält wahrscheinlich **handschriftlichen Text**, der in Schreibschrift oder Druckbuchstaben verfasst sein kann. Das Bild könnte auch schlecht beleuchtet oder verschwommen sein.

            **Spezialanweisungen für Handschrift:**
            - Gib dein Bestes, um auch unklare Handschriften zu entziffern.
            - Konzentriere dich darauf, den Sinn und die wesentlichen Informationen (Zutaten, Schritte) zu erfassen, auch wenn einzelne Buchstaben schwer zu lesen sind.
            - Wenn ein Wort mehrdeutig ist, versuche, es aus dem Kontext des Rezepts zu erschließen. Priorisiere eine lesbare und plausible Interpretation gegenüber einer buchstabengetreuen, aber unsinnigen Transkription.

            **Allgemeine Anweisungen:**
            1. Wenn der Text trotz aller Bemühungen **völlig unleserlich** ist (z.B. durch extreme Unschärfe oder sehr unordentliche Schrift), setze 'isReadable' auf 'false' und gib im Feld 'unreadableReason' eine kurze Begründung an (z.B. 'handschriftlich unleserlich', 'stark verschwommen').
            2. Wenn das Rezept zumindest teilweise entziffert werden kann, setze 'isReadable' auf 'true' und extrahiere den Rezeptnamen, die Zutaten und die Anleitung so gut wie möglich.
            3. Lasse Felder leer, wenn die entsprechenden Informationen nicht auf dem Bild vorhanden sind oder nicht entziffert werden können.

            Gib die Antwort als einzelnes JSON-Objekt zurück, das dem bereitgestellten Schema entspricht. Gib keinen Markdown oder zusätzlichen Text aus.
        `;

        const result = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: image } },
                    { text: prompt }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: ocrSchema,
            },
        });

        const extractedData: { 
            isReadable: boolean; 
            unreadableReason?: string;
            recipeName?: string; 
            ingredients?: string[]; 
            instructions?: string[] 
        } = JSON.parse(result.text);

        if (!extractedData.isReadable) {
            const reason = extractedData.unreadableReason || 'Zu undeutlich';
            alert(`Das Bild konnte nicht gelesen werden. Grund: ${reason}.`);
            return;
        }

        // Populate form
        if (extractedData.recipeName) {
            addRecipeNameInput.value = extractedData.recipeName;
        }
        if (extractedData.ingredients && extractedData.ingredients.length > 0) {
            addRecipeIngredientsTextarea.value = extractedData.ingredients.join('\n');
        }
        if (extractedData.instructions && extractedData.instructions.length > 0) {
            addRecipeInstructionsTextarea.value = extractedData.instructions.join('\n');
        }

    } catch (error) {
        console.error("Fehler bei der Bilderkennung im Modal:", error);
        if (error instanceof DOMException && error.name === 'NotReadableError') {
            alert('Beim Lesen der Bilddatei ist ein Fehler aufgetreten. Bitte versuche es mit einer anderen Datei.');
        } else {
            alert(`Entschuldigung, bei der Analyse des Bildes ist ein Fehler aufgetreten. (${error.message})`);
        }
    } finally {
        // Reset loading state
        importFromImageBtn.disabled = false;
        saveBtn.disabled = false;
        importFromImageBtn.textContent = originalImportText;
        importImageInput.value = ''; // Reset file input
    }
}


async function handleAddRecipe(event: Event) {
    event.preventDefault();

    const imageFile = addRecipeImageInput.files?.[0];
    let imageUrl: string | undefined = undefined;

    if (imageFile) {
        if (!imageFile.type.startsWith('image/')) {
            alert('Ungültiges Dateiformat für das Rezeptbild. Bitte lade ein Bild (z.B. JPG, PNG) hoch.');
            return;
        }
        try {
            // USE COMPRESSION: Resize to 800px and quality 0.7 to save space
            imageUrl = await compressImage(imageFile, 800, 0.7);
        } catch (error) {
            console.error("Fehler beim Lesen der Bilddatei:", error);
            alert("Beim Lesen des Rezeptbildes ist ein Fehler aufgetreten. Bitte versuche es mit einer anderen Datei.");
            return;
        }
    }

    const newRecipe: Recipe = {
        recipeName: addRecipeNameInput.value.trim(),
        description: addRecipeDescriptionTextarea.value.trim(),
        ingredients: addRecipeIngredientsTextarea.value.split('\n').map(line => line.trim()).filter(line => line),
        instructions: addRecipeInstructionsTextarea.value.split('\n').map(line => line.trim()).filter(line => line),
        imageUrl: imageUrl,
        servings: 4 // Default servings for manual recipes
    };

    if (!newRecipe.recipeName || newRecipe.ingredients.length === 0 || newRecipe.instructions.length === 0) {
        alert("Bitte fülle alle erforderlichen Felder aus.");
        return;
    }

    if (saveRecipeToStorage(newRecipe)) {
        addRecipeForm.reset();
        addRecipeModal.classList.add('hidden');
        renderSavedRecipes();
        renderRecipe(newRecipe); // Display the newly added and saved recipe
        clearDraft();
    }
    // If saving fails (e.g., duplicate name), the user stays in the modal to correct it.
}


// --- Theme Toggle ---
export function toggleTheme(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.checked) {
        document.body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
    } else {
        document.body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
    }
}


// --- Event Listeners ---
export function initializeApp() {
    recipeForm.addEventListener('submit', generateRecipe);

    // Draft listeners
    checkForDraft();
    window.addEventListener('beforeunload', saveDraft);

    // OCR Listeners
    ocrButton.addEventListener('click', () => {
        ocrInput.click();
    });
    ocrInput.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            recognizeTextFromImage(file);
        }
    });

    // Add Recipe Modal OCR Listeners
    importFromImageBtn.addEventListener('click', () => {
        importImageInput.click();
    });
    importImageInput.addEventListener('change', (event) => {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (file) {
            handleModalImageImport(file);
        }
    });


    // Modal Toggles
    viewSavedBtn.addEventListener('click', () => {
        if (savedRecipesSearchInput) savedRecipesSearchInput.value = ''; // Reset search
        renderSavedRecipes();
        savedRecipesModal.classList.remove('hidden');
    });
    closeModalBtn.addEventListener('click', () => savedRecipesModal.classList.add('hidden'));

    browseRecipesBtn.addEventListener('click', () => {
        renderBrowseRecipes();
        browseRecipesModal.classList.remove('hidden');
    });
    closeBrowseModalBtn.addEventListener('click', () => browseRecipesModal.classList.add('hidden'));

    addRecipeBtn.addEventListener('click', () => addRecipeModal.classList.remove('hidden'));
    closeAddModalBtn.addEventListener('click', () => addRecipeModal.classList.add('hidden'));

    // Close modals on overlay click
    [savedRecipesModal, browseRecipesModal, addRecipeModal].forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    });

    if (savedRecipesSearchInput) {
        savedRecipesSearchInput.addEventListener('input', filterSavedRecipes);
    }

    addRecipeForm.addEventListener('submit', handleAddRecipe);

    // Theme
    themeToggle.addEventListener('change', toggleTheme);
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        themeToggle.checked = true;
    }

    // Initial State
    updateSavedCount();
}

// --- App Initialization ---
// Only run initializeApp in a browser environment
if (typeof window !== 'undefined') {
    initializeApp();
}
