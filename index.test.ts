
import { jest, describe, test, beforeEach, expect } from '@jest/globals';
import { Recipe } from './index';

// --- Types and Helper Functions ---

type MockedHtmlElement<T extends HTMLElement = HTMLElement> = T & {
    classList: {
        add: jest.Mock<any>;
        remove: jest.Mock<any>;
        toggle: jest.Mock<any>;
        contains: jest.Mock<any>;
    };
    addEventListener: jest.Mock<any>;
    removeEventListener: jest.Mock<any>;
    dispatchEvent: jest.Mock<any>;
    value: string;
    textContent: string;
    disabled: boolean;
    files: FileList | null;
    style: {
        opacity: string;
    };
};

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
            contains: jest.fn((cls) => false),
        },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
        files: null,
        style: {
            opacity: '',
        },
        ...initialProps,
    };
    return element as MockedHtmlElement<any>;
};

// --- Define Mocks ---
const mockPromptInput = mockDOMElement('prompt-input', { value: '' });
const mockServingsInput = mockDOMElement('servings-input', { value: '2' });
const mockDifficultySelect = mockDOMElement('difficulty-select', { value: 'leicht' });
const mockWishesInput = mockDOMElement('wishes-input', { value: '' });
const mockDraftNotification = mockDOMElement('draft-notification');
const mockRestoreDraftBtn = mockDOMElement('restore-draft-btn');
const mockDismissDraftBtn = mockDOMElement('dismiss-draft-btn');
const mockSavedCountBadge = mockDOMElement('saved-count-badge');
const mockLoadingIndicator = mockDOMElement('loading-overlay');
const mockLoaderMsg = mockDOMElement('loader-msg');
const mockRecipeOutput = mockDOMElement('recipe-output');
const mockSavedRecipesList = mockDOMElement('saved-recipes-list');

// --- Mocks Setup ---
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

const mockAlert = jest.fn();
const mockConfirm = jest.fn();
Object.defineProperty(window, 'alert', { value: mockAlert });
Object.defineProperty(window, 'confirm', { value: mockConfirm });

jest.spyOn(document, 'getElementById').mockImplementation((id) => {
    switch (id) {
        case 'prompt-input': return mockPromptInput;
        case 'servings-input': return mockServingsInput;
        case 'difficulty-select': return mockDifficultySelect;
        case 'wishes-input': return mockWishesInput;
        case 'draft-notification': return mockDraftNotification;
        case 'restore-draft-btn': return mockRestoreDraftBtn;
        case 'dismiss-draft-btn': return mockDismissDraftBtn;
        case 'saved-count-badge': return mockSavedCountBadge;
        case 'loading-overlay': return mockLoadingIndicator;
        case 'loader-msg': return mockLoaderMsg;
        case 'recipe-output': return mockRecipeOutput;
        case 'saved-recipes-list': return mockSavedRecipesList;
        default: return null as any;
    }
});

jest.mock('./index', () => {
    const originalModule: any = jest.requireActual('./index');
    return {
        ...originalModule,
        renderSavedRecipes: jest.fn(),
        promptInput: jest.fn(() => mockPromptInput),
        servingsInput: jest.fn(() => mockServingsInput),
        difficultySelect: jest.fn(() => mockDifficultySelect),
        wishesInput: jest.fn(() => mockWishesInput),
        draftNotification: jest.fn(() => mockDraftNotification),
        restoreDraftBtn: jest.fn(() => mockRestoreDraftBtn),
        dismissDraftBtn: jest.fn(() => mockDismissDraftBtn),
        savedCountBadge: jest.fn(() => mockSavedCountBadge),
        loadingIndicator: jest.fn(() => mockLoadingIndicator),
        recipeOutput: jest.fn(() => mockRecipeOutput),
        savedRecipesList: jest.fn(() => mockSavedRecipesList),
    };
});

// Fix: Remove updateRecipeInStorage and isRecipeSaved as they are not exported from index.tsx
import {
    getSavedRecipes,
    saveRecipeToStorage,
    removeRecipeFromStorage,
    updateSavedCount,
    saveDraft,
    clearDraft,
    checkForDraft,
    scaleIngredientLine,
    updateIngredientQuantities,
    renderSavedRecipes as mockedRenderSavedRecipes,
} from './index';

describe('Gourmet AI - Logic Tests', () => {
    const mockRecipe1: Recipe = {
        id: '1',
        recipeName: 'Pasta Pomodoro',
        description: 'Einfache Nudeln',
        ingredients: ['500g Nudeln', '2 Dosen Tomaten'],
        instructions: ['Kochen', 'Mischen'],
        servings: 4,
        createdAt: Date.now()
    };

    beforeEach(() => {
        localStorageMock.clear();
        jest.clearAllMocks();
        mockPromptInput.value = '';
        mockServingsInput.value = '2';
        mockDifficultySelect.value = 'leicht';
        mockConfirm.mockReturnValue(true);
    });

    test('scaleIngredientLine should scale correctly', () => {
        expect(scaleIngredientLine('500g Nudeln', 4, 2)).toBe('250g Nudeln');
        expect(scaleIngredientLine('1,5kg Mehl', 2, 4)).toBe('3kg Mehl');
    });

    test('saveRecipeToStorage should respect existing recipes', () => {
        saveRecipeToStorage(mockRecipe1);
        expect(localStorageMock.setItem).toHaveBeenCalled();
        
        // Try saving same recipe again
        mockConfirm.mockReturnValue(false);
        saveRecipeToStorage(mockRecipe1);
        expect(mockConfirm).toHaveBeenCalled();
    });

    test('saveDraft should handle empty prompt correctly', () => {
        mockPromptInput.value = 'Pizza';
        saveDraft();
        expect(localStorageMock.setItem).toHaveBeenCalledWith('recipeDraft', expect.any(String));

        mockPromptInput.value = '';
        saveDraft();
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('recipeDraft');
    });
});
