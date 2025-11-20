
import { jest, describe, test, beforeEach, expect } from '@jest/globals';

// --- Types and Helper Functions ---

// Fix: Define a specific type for the mocked DOM elements to ensure methods are recognized as Jest Mocks
type MockedHtmlElement<T extends HTMLElement = HTMLElement> = T & {
    classList: {
        add: jest.Mock<any, any>;
        remove: jest.Mock<any, any>;
        toggle: jest.Mock<any, any>;
        contains: jest.Mock<any, any>;
    };
    addEventListener: jest.Mock<any, any>;
    removeEventListener: jest.Mock<any, any>;
    dispatchEvent: jest.Mock<any, any>;
    value: string; // Add value for input elements
    textContent: string; // Add textContent for spans/divs
    disabled: boolean;
    files: FileList | null; // Fix: FileList can be null if no files are selected
    style: {
        opacity: string;
    };
};

// Fix: Create mock DOM elements with explicitly typed Jest mock functions
const mockDOMElement = (id: string, initialProps: any = {}): MockedHtmlElement<any> => {
    const element: Partial<MockedHtmlElement<any>> = {
        id,
        value: '',
        textContent: '',
        disabled: false,
        classList: {
            add: jest.fn(),
            remove: jest.fn(),
            toggle: jest.fn(),
            contains: jest.fn((cls) => false), // Default contains to false
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
        files: null, // Fix: Initialize with null or actual FileList mock
        style: {
            opacity: '',
        },
        ...initialProps,
    };
    return element as MockedHtmlElement<any>;
};

// --- Define Mocks (Must be defined before use in spies/mocks) ---
// These definitions fix the "Cannot find name 'mockPromptInput'" and similar errors
const mockPromptInput = mockDOMElement('prompt-input', { value: '' });
const mockDifficultySelect = mockDOMElement('difficulty-select', { value: 'Anfänger' });
const mockWishesInput = mockDOMElement('wishes-input', { value: '' });
const mockDraftNotification = mockDOMElement('draft-notification');
const mockRestoreDraftBtn = mockDOMElement('restore-draft-btn');
const mockDismissDraftBtn = mockDOMElement('dismiss-draft-btn');
const mockSavedCountBadge = mockDOMElement('saved-count-badge');
const mockLoadingIndicatorSpan = mockDOMElement('loading-indicator-span');
const mockSavedRecipesSearchInput = mockDOMElement('saved-recipes-search', { value: '' });

// --- Mocks Setup ---
// Mock localStorage
const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
        getItem: jest.fn((key: string) => store[key] || null),
        setItem: jest.fn((key: string, value: string) => {
            store[key] = value.toString();
        }),
        removeItem: jest.fn((key: string) => {
            delete store[key];
        }),
        clear: jest.fn(() => {
            store = {};
        }),
    };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock window.alert and window.confirm
const mockAlert = jest.fn();
const mockConfirm = jest.fn();
Object.defineProperty(window, 'alert', { value: mockAlert });
Object.defineProperty(window, 'confirm', { value: mockConfirm });

// Fix: Use explicitly imported jest object for spyOn
jest.spyOn(document, 'getElementById').mockImplementation((id) => {
    switch (id) {
        case 'prompt-input': return mockPromptInput;
        case 'difficulty-select': return mockDifficultySelect;
        case 'wishes-input': return mockWishesInput;
        case 'draft-notification': return mockDraftNotification;
        case 'restore-draft-btn': return mockRestoreDraftBtn;
        case 'dismiss-draft-btn': return mockDismissDraftBtn;
        case 'saved-count-badge': return mockSavedCountBadge;
        case 'saved-recipes-search': return mockSavedRecipesSearchInput;
        // Mock other elements if they become relevant in exported functions' tests
        default: return null as any;
    }
});

// Fix: Use explicitly imported jest object for spyOn
jest.spyOn(document, 'querySelector').mockImplementation((selector) => {
    if (selector === '#loading-indicator span') {
        return mockLoadingIndicatorSpan;
    }
    return null as any;
});

// Mock renderSavedRecipes to prevent actual DOM manipulation during these tests
// Fix: Use explicitly imported jest object
jest.mock('./index', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const originalModule: any = jest.requireActual('./index');
    return {
        ...originalModule,
        renderSavedRecipes: jest.fn(), // Mock this specific function
        // Ensure that mockDOMElement properties are also reflected for the imported variables
        promptInput: mockPromptInput,
        difficultySelect: mockDifficultySelect,
        wishesInput: mockWishesInput,
        draftNotification: mockDraftNotification,
        restoreDraftBtn: mockRestoreDraftBtn,
        dismissDraftBtn: mockDismissDraftBtn,
        savedCountBadge: mockSavedCountBadge,
        loadingIndicatorSpan: mockLoadingIndicatorSpan, // Ensure span is available
        savedRecipesSearchInput: mockSavedRecipesSearchInput,
    };
});

// Import the functions and mocked variables from the mocked module
import {
    getSavedRecipes,
    saveRecipeToStorage,
    updateRecipeInStorage,
    removeRecipeFromStorage,
    isRecipeSaved,
    updateSavedCount,
    saveDraft,
    clearDraft,
    checkForDraft,
    scaleIngredientLine, // Import function to test
    updateIngredientQuantities, // Import function to test
    renderSavedRecipes as mockedRenderSavedRecipes,
    // Imported mocked DOM elements
    promptInput,
    difficultySelect,
    wishesInput,
    draftNotification,
    restoreDraftBtn,
    dismissDraftBtn,
    savedCountBadge,
} from './index';


describe('LocalStorage and Draft Functions', () => {
    const mockRecipe1 = {
        recipeName: 'Pasta Pomodoro',
        description: 'Eine einfache Nudelgericht',
        ingredients: ['500g Nudeln', '2 Dosen Tomaten'],
        instructions: ['Kochen', 'Mischen'],
        servings: 4
    };

    const mockRecipe2 = {
        recipeName: 'Curry mit Reis',
        description: 'Ein würziges Gericht',
        ingredients: ['200g Reis', '300g Hähnchen', '2 EL Currypulver'],
        instructions: ['Braten', 'Kochen'],
        servings: 2
    };

    beforeEach(() => {
        localStorageMock.clear(); // Clear localStorage before each test
        jest.clearAllMocks(); // Clear all jest mocks

        // Reset mock DOM element states
        mockPromptInput.value = '';
        mockDifficultySelect.value = 'Anfänger';
        mockWishesInput.value = '';
        mockSavedRecipesSearchInput.value = '';
        // Fix: Explicitly cast classList methods and addEventListener to jest.Mock before calling mockClear()
        (draftNotification.classList.add as jest.Mock).mockClear();
        (draftNotification.classList.remove as jest.Mock).mockClear();
        (draftNotification.classList.toggle as jest.Mock).mockClear();
        (draftNotification.classList.contains as jest.Mock).mockClear();
        (restoreDraftBtn.addEventListener as jest.Mock).mockClear();
        // Clear mock for dismiss button's addEventListener
        (dismissDraftBtn.addEventListener as jest.Mock).mockClear();
        mockSavedCountBadge.textContent = '';
        (savedCountBadge.classList.add as jest.Mock).mockClear();
        (savedCountBadge.classList.remove as jest.Mock).mockClear();
        
        // Fix: Cast to jest.Mock to avoid 'Property mockClear does not exist' error
        (mockedRenderSavedRecipes as jest.Mock).mockClear();
        
        mockAlert.mockClear();
        mockConfirm.mockClear();
    });

    // --- Ingredient Scaling Tests ---
    describe('Ingredient Scaling Logic', () => {
        test('scaleIngredientLine should scale integers correctly', () => {
            // 500g for 4 people -> for 2 people = 250g
            expect(scaleIngredientLine('500g Nudeln', 4, 2)).toBe('250g Nudeln');
            // 500g for 4 people -> for 8 people = 1000g
            expect(scaleIngredientLine('500g Nudeln', 4, 8)).toBe('1000g Nudeln');
        });

        test('scaleIngredientLine should scale decimals with dot correctly', () => {
            // 0.5l for 2 people -> for 4 people = 1l
            expect(scaleIngredientLine('0.5l Milch', 2, 4)).toBe('1l Milch');
        });

        test('scaleIngredientLine should scale decimals with comma (German format) correctly', () => {
            // 0,5l for 2 people -> for 4 people = 1l
            expect(scaleIngredientLine('0,5l Milch', 2, 4)).toBe('1l Milch');
            // 1,5kg for 2 people -> for 3 people = 2,25kg
            expect(scaleIngredientLine('1,5kg Kartoffeln', 2, 3)).toBe('2,25kg Kartoffeln');
        });

        test('scaleIngredientLine should ignore lines without numbers', () => {
            expect(scaleIngredientLine('Salz und Pfeffer', 4, 2)).toBe('Salz und Pfeffer');
        });

        test('scaleIngredientLine should handle spaces between number and unit', () => {
            expect(scaleIngredientLine('2 EL Öl', 2, 4)).toBe('4 EL Öl');
        });

        test('updateIngredientQuantities should return a list of scaled ingredients', () => {
             const originalRecipe = {
                recipeName: 'Test',
                description: 'Test',
                ingredients: ['100g Mehl', '2 Eier', 'Prise Salz'],
                instructions: [],
                servings: 2
            };
            
            // Scale to 4 servings
            const scaled = updateIngredientQuantities(originalRecipe, 4);
            
            expect(scaled).toHaveLength(3);
            expect(scaled[0]).toBe('200g Mehl');
            expect(scaled[1]).toBe('4 Eier');
            expect(scaled[2]).toBe('Prise Salz');
        });

         test('updateIngredientQuantities should handle fallback if servings is missing in recipe', () => {
             const originalRecipe = {
                recipeName: 'Test',
                description: 'Test',
                ingredients: ['100g Mehl'],
                instructions: [],
                servings: undefined as any // Simulate old data
            };
            
            // Should return original if no base servings known (or we could default to 4, implementation dependent)
            // Current implementation returns original if servings is falsy
            const scaled = updateIngredientQuantities(originalRecipe, 4);
            expect(scaled[0]).toBe('100g Mehl');
        });
    });

    // --- getSavedRecipes ---
    test('getSavedRecipes should return an empty array if no recipes are saved', () => {
        expect(getSavedRecipes()).toEqual([]);
        expect(localStorageMock.getItem).toHaveBeenCalledWith('savedRecipes');
    });

    test('getSavedRecipes should return parsed recipes if they exist in localStorage', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1]));
        expect(getSavedRecipes()).toEqual([mockRecipe1]);
    });

    // --- saveRecipeToStorage ---
    test('saveRecipeToStorage should save a new recipe to localStorage', () => {
        const result = saveRecipeToStorage(mockRecipe1);
        expect(result).toBe(true);
        expect(localStorageMock.setItem).toHaveBeenCalledWith('savedRecipes', JSON.stringify([mockRecipe1]));
        expect(mockAlert).not.toHaveBeenCalled();
        expect(updateSavedCount).toHaveBeenCalledTimes(1);
    });

    test('saveRecipeToStorage should return false and not save if a recipe with the same name already exists (case-insensitive)', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1]));
        mockAlert.mockImplementation(() => {}); // Mock alert to prevent test failure

        const duplicateRecipe = { ...mockRecipe1, recipeName: 'pasta pomodoro' };
        const result = saveRecipeToStorage(duplicateRecipe);

        expect(result).toBe(false);
        // Should not have been called again with the duplicate
        expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
        expect(localStorageMock.getItem).toHaveBeenCalledWith('savedRecipes');
        expect(mockAlert).toHaveBeenCalledWith('Ein Rezept mit diesem Namen existiert bereits.');
        expect(updateSavedCount).not.toHaveBeenCalled(); // Should not update count on failure
    });

    // --- updateRecipeInStorage ---
    test('updateRecipeInStorage should update an existing recipe by name (case-insensitive)', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1, mockRecipe2]));
        const updatedRecipe = { ...mockRecipe1, description: 'Updated description' };
        updateRecipeInStorage('pasta pomodoro', updatedRecipe);

        const expectedRecipes = [updatedRecipe, mockRecipe2];
        expect(localStorageMock.setItem).toHaveBeenCalledWith('savedRecipes', JSON.stringify(expectedRecipes));
        expect(updateSavedCount).toHaveBeenCalledTimes(1);
        expect(mockedRenderSavedRecipes).toHaveBeenCalledTimes(1);
    });

    test('updateRecipeInStorage should not update if the recipe name does not exist', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1]));
        const nonExistentRecipe = { ...mockRecipe2, recipeName: 'Non Existent' };
        updateRecipeInStorage('Non Existent', nonExistentRecipe);

        expect(localStorageMock.setItem).not.toHaveBeenCalledWith('savedRecipes', expect.any(String));
        expect(updateSavedCount).not.toHaveBeenCalled();
        expect(mockedRenderSavedRecipes).not.toHaveBeenCalled();
    });

    // --- removeRecipeFromStorage ---
    test('removeRecipeFromStorage should remove a recipe from localStorage by name', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1, mockRecipe2]));
        removeRecipeFromStorage('Pasta Pomodoro');

        expect(localStorageMock.setItem).toHaveBeenCalledWith('savedRecipes', JSON.stringify([mockRecipe2]));
        expect(updateSavedCount).toHaveBeenCalledTimes(1);
        expect(mockedRenderSavedRecipes).toHaveBeenCalledTimes(1);
    });

    test('removeRecipeFromStorage should not throw an error if the recipe does not exist', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1]));
        expect(() => removeRecipeFromStorage('Non Existent')).not.toThrow();
        expect(localStorageMock.setItem).not.toHaveBeenCalledWith('savedRecipes', expect.any(String)); // No change if not found
        expect(updateSavedCount).not.toHaveBeenCalled(); // No update if no change
        expect(mockedRenderSavedRecipes).not.toHaveBeenCalled(); // No render if no change
    });

    // --- isRecipeSaved ---
    test('isRecipeSaved should return true if a recipe with the given name exists (case-insensitive)', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1]));
        expect(isRecipeSaved('Pasta Pomodoro')).toBe(true);
        expect(isRecipeSaved('pasta pomodoro')).toBe(true);
    });

    test('isRecipeSaved should return false if no recipe with the given name exists', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1]));
        expect(isRecipeSaved('Non Existent')).toBe(false);
    });

    // --- updateSavedCount ---
    test('updateSavedCount should update the badge and show it if recipes exist', () => {
        localStorageMock.setItem('savedRecipes', JSON.stringify([mockRecipe1, mockRecipe2]));
        updateSavedCount();
        expect(savedCountBadge.textContent).toBe('2');
        expect(savedCountBadge.classList.remove).toHaveBeenCalledWith('hidden');
        expect(savedCountBadge.classList.add).not.toHaveBeenCalledWith('hidden');
    });

    test('updateSavedCount should update the badge and hide it if no recipes exist', () => {
        localStorageMock.clear(); // Ensure no recipes
        updateSavedCount();
        expect(savedCountBadge.textContent).toBe(''); // or '0' depending on default textContent
        expect(savedCountBadge.classList.add).toHaveBeenCalledWith('hidden');
        expect(savedCountBadge.classList.remove).not.toHaveBeenCalledWith('hidden');
    });

    // --- saveDraft ---
    test('saveDraft should save a draft if promptInput has a value', () => {
        promptInput.value = 'My new recipe';
        difficultySelect.value = 'Fortgeschritten';
        wishesInput.value = 'Spicy';

        saveDraft();

        // Expect it to save the draft including servings (defaulting to NaN if input is empty in mock, or 2 based on logic)
        // In this test setup, servingsInput.value is empty string, so parseInt is NaN, logic defaults to 2
        expect(localStorageMock.setItem).toHaveBeenCalledWith('recipeDraft', expect.stringContaining('"prompt":"My new recipe"'));
    });

    test('saveDraft should clear the draft if promptInput is empty', () => {
        promptInput.value = '';
        localStorageMock.setItem('recipeDraft', JSON.stringify({ prompt: 'Old draft' })); // Seed a draft

        saveDraft();

        expect(localStorageMock.removeItem).toHaveBeenCalledWith('recipeDraft');
        expect(localStorageMock.setItem).not.toHaveBeenCalledWith('recipeDraft', expect.any(String));
    });

    // --- clearDraft ---
    test('clearDraft should remove the draft from localStorage', () => {
        localStorageMock.setItem('recipeDraft', JSON.stringify({ prompt: 'Existing draft' }));
        clearDraft();
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('recipeDraft');
    });

    // --- checkForDraft ---
    test('checkForDraft should display notification and attach event listeners if a draft exists', () => {
        const draft = { prompt: 'Existing draft', difficulty: 'Anfänger', wishes: 'Sweet', servings: 4 };
        localStorageMock.setItem('recipeDraft', JSON.stringify(draft));

        checkForDraft();

        expect(draftNotification.classList.remove).toHaveBeenCalledWith('hidden');
        expect(restoreDraftBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));
        expect(dismissDraftBtn.addEventListener).toHaveBeenCalledWith('click', expect.any(Function));

        // Test restore draft action
        const restoreHandler = (restoreDraftBtn.addEventListener as jest.Mock).mock.calls[0][1];
        restoreHandler(); // Simulate click
        expect(promptInput.value).toBe(draft.prompt);
        expect(difficultySelect.value).toBe(draft.difficulty);
        expect(wishesInput.value).toBe(draft.wishes);
        // servingsInput is not mocked to return value on read, but we expect the assignment to happen in code
        expect(draftNotification.classList.add).toHaveBeenCalledWith('hidden');

        // Reset for dismiss test
        jest.clearAllMocks();
        localStorageMock.setItem('recipeDraft', JSON.stringify(draft)); // Re-seed draft
        (draftNotification.classList.remove as jest.Mock).mockRestore(); // Restore mock for classList.remove
        (draftNotification.classList.add as jest.Mock).mockRestore(); // Restore mock for classList.add
        (draftNotification.classList.remove as jest.Mock)('hidden'); // Ensure it's visible again for dismiss test
        
        // Re-call checkForDraft to attach listeners again
        checkForDraft();
        const dismissHandler = (dismissDraftBtn.addEventListener as jest.Mock).mock.calls[0][1];
        dismissHandler(); // Simulate click
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('recipeDraft');
        expect(draftNotification.classList.add).toHaveBeenCalledWith('hidden');
    });

    test('checkForDraft should not display notification if no draft exists', () => {
        localStorageMock.clear(); // No draft
        checkForDraft();
        expect(draftNotification.classList.remove).not.toHaveBeenCalled();
        expect(restoreDraftBtn.addEventListener).not.toHaveBeenCalled();
        expect(dismissDraftBtn.addEventListener).not.toHaveBeenCalled();
    });
});