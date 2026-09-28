// Meal types match plannedrecipes.meal_type and recipes.meals in the database.
export const MEAL_TYPES = [
    { id: 1, name: 'Breakfast' },
    { id: 2, name: 'Lunch' },
    { id: 3, name: 'Dinner' }
];

export const mealTypeName = (id) => MEAL_TYPES.find((m) => m.id === Number(id))?.name;

// steps/ingredients have been stored both as jsonb arrays and as JSON-encoded strings.
export const toTextList = (value) => {
    if (value == null) return null;
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [value];
        } catch {
            return [value];
        }
    }
    return null;
};

// Labels for lookup ids; unknown ids render nothing instead of crashing.
export const labelFor = (list, id) => list?.[id]?.label;
