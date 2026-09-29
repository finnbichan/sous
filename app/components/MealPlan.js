import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { supabase } from '../../supabase';
import { AuthContext } from '../../Contexts';
import RecipeBase from './RecipeBase';
import SearchModal from './SearchModal';
import { NoteModal, MoveModal, MealActionsSheet } from './MealSlotModals';
import { useTheme } from '@react-navigation/native';
import { mealTypeName } from '../utils/recipes';
import { parseLocalDate } from '../utils/dates';

const showNoRecipe = (meal_name) => Alert.alert(
    'Nothing to suggest',
    `None of your ${meal_name.toLowerCase()} recipes fit your preferences. Add one from the Recipes tab or check Profile & Preferences.`
);

const showPlanError = () => Alert.alert('Something went wrong', 'Please check your connection and try again.');

const MealPlanStyles = (props) => StyleSheet.create({
    container: {
        backgroundColor: props.colours.card,
        borderRadius: 8,
        paddingHorizontal: 10,
        marginTop: 4,
        paddingVertical: 6
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '99%',
        marginTop: 4,
        marginBottom: 4
    },
    details: {
        flex: 1
    },
    image: {
        height: 36,
        width: 36,
        marginHorizontal: 4
    },
    emptyText: {
        color: props.colours.text,
        fontSize: 18,
        paddingBottom: 4
    },
    lowImpactText: {
        color: props.colours.secondaryText,
        marginTop: -4
    },
    noteText: {
        color: props.colours.text,
        fontSize: 18,
        fontStyle: 'italic',
        paddingBottom: 4
    }
});

function useMealPlanStyles() {
    const { colours } = useTheme();
    return React.useMemo(() => MealPlanStyles({ colours }), [colours]);
}

// One meal slot on the calendar. The card opens a sheet with all the options;
// the only button on the card itself is roll (empty) / re-roll (planned).
// Read-only (meal history): tapping opens the recipe.
const MealPlan = ({ navigation, meal_type, date, recipe, note, plannedrecipe_id, addPlannedRecipe, deletePlannedRecipe, rerollPlannedRecipe, editable, moveDates, onPlanChanged }) => {
    const session = useContext(AuthContext);
    const { assets } = useTheme();
    const mealPlanStyles = useMealPlanStyles();
    // null | 'actions' | 'search' | 'note' | 'move' — only one sheet open at a time
    const [sheet, setSheet] = useState(null);
    const [loading, setLoading] = useState(false);

    const meal_name = mealTypeName(meal_type) ?? 'Meal';
    const isPlanned = Boolean(recipe || note);
    const dateLabel = parseLocalDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

    const openRecipe = () => {
        setSheet(null);
        navigation.navigate("Recipe", { prevScreen: 'Home', recipe: recipe });
    };

    // Put a new planned meal in this slot, replacing whatever was there.
    const placeInSlot = async (newPlanned) => {
        if (plannedrecipe_id) {
            const { error } = await supabase
                .from('plannedrecipes')
                .update({ active: false })
                .eq('id', plannedrecipe_id);
            if (error) {
                console.log("error", error);
            }
            rerollPlannedRecipe(newPlanned, plannedrecipe_id);
        } else {
            addPlannedRecipe(newPlanned);
        }
    };

    const runPlanChange = async (work) => {
        setSheet(null);
        setLoading(true);
        await work();
        setLoading(false);
    };

    // Suggest a recipe; on a planned slot the current meal stays if nothing fits.
    const suggest = () => runPlanChange(async () => {
        const { data, error } = await supabase.rpc('suggest_recipe', { p_mealtype: meal_type, p_date: date, p_user_id: session.user.id });
        if (error) {
            console.log(error);
            showPlanError();
        } else if (!data) {
            showNoRecipe(meal_name);
        } else {
            await placeInSlot(data);
        }
    });

    const chooseRecipe = (chosen) => runPlanChange(async () => {
        const { data, error } = await supabase.rpc('add_single_planned_recipe',
            { p_mealtype: meal_type, p_date: date, p_user_id: session.user.id, p_recipe_id: chosen.recipe_id });
        if (error || !data) {
            console.log(error);
            showPlanError();
        } else {
            await placeInSlot(data);
        }
    });

    const saveNote = async (text) => {
        const { data, error } = await supabase.rpc('add_planned_note', { p_mealtype: meal_type, p_date: date, p_note: text });
        if (error || !data) {
            console.log(error);
            return false;
        }
        await placeInSlot(data);
        return true;
    };

    const remove = () => runPlanChange(async () => {
        const { error } = await supabase
            .from('plannedrecipes')
            .update({ active: false })
            .eq('id', plannedrecipe_id);
        if (error) {
            console.log("error", error);
            showPlanError();
        } else {
            deletePlannedRecipe(plannedrecipe_id);
        }
    });

    const moveMeal = async (newDate, newMealType) => {
        const { error } = await supabase.rpc('move_planned_recipe', { p_plannedrecipe_id: plannedrecipe_id, p_date: newDate, p_mealtype: newMealType });
        if (error) {
            console.log(error);
            return false;
        }
        onPlanChanged?.();
        return true;
    };

    const actions = isPlanned ? [
        recipe && { label: 'View recipe', onPress: openRecipe, primary: true },
        { label: recipe ? 'Suggest a different recipe' : 'Suggest a recipe instead', onPress: suggest },
        { label: 'Replace from my recipes', onPress: () => setSheet('search') },
        { label: note ? 'Change note' : 'Change to a note', onPress: () => setSheet('note') },
        moveDates?.length && { label: 'Move to another day', onPress: () => setSheet('move') },
        { label: 'Remove', onPress: remove, destructive: true }
    ].filter(Boolean) : [
        { label: 'Suggest a recipe', onPress: suggest, primary: true },
        { label: 'Choose from my recipes', onPress: () => setSheet('search') },
        { label: 'Add a note (e.g. eating out)', onPress: () => setSheet('note') }
    ];

    const onCardPress = () => {
        if (editable) {
            setSheet('actions');
        } else if (recipe) {
            openRecipe();
        }
    };

    const summary = recipe?.name ?? note ?? 'Nothing planned';

    return (
        <View style={mealPlanStyles.container}>
            <View style={mealPlanStyles.row}>
                <TouchableOpacity
                    style={mealPlanStyles.details}
                    onPress={onCardPress}
                    disabled={loading || (!editable && !recipe)}
                    accessibilityRole="button"
                    accessibilityLabel={`${meal_name}: ${summary}`}
                    accessibilityHint={editable ? 'Opens options for this meal' : undefined}
                >
                    <Text style={mealPlanStyles.lowImpactText}>{meal_name}</Text>
                    {loading ? (
                        <ActivityIndicator style={{ alignSelf: 'flex-start', paddingVertical: 8 }} />
                    ) : recipe ? (
                        <RecipeBase recipe={recipe} />
                    ) : note ? (
                        <Text style={mealPlanStyles.noteText}>{note}</Text>
                    ) : (
                        <Text style={mealPlanStyles.emptyText}>Nothing planned</Text>
                    )}
                </TouchableOpacity>
                {editable && !loading ? (
                    <TouchableOpacity
                        onPress={suggest}
                        accessibilityRole="button"
                        accessibilityLabel={isPlanned ? `Suggest a different ${meal_name.toLowerCase()}` : `Suggest a recipe for ${meal_name}`}
                        hitSlop={8}
                    >
                        <Image
                            style={mealPlanStyles.image}
                            source={isPlanned ? assets.refresh : assets.bolt}
                        />
                    </TouchableOpacity>
                ) : null}
            </View>

            <MealActionsSheet
                visible={sheet === 'actions'}
                title={meal_name}
                subtitle={dateLabel}
                preview={recipe ? <RecipeBase recipe={recipe} /> : note ? <Text style={mealPlanStyles.noteText}>{note}</Text> : null}
                actions={actions}
                onClose={() => setSheet(null)}
            />
            <SearchModal
                searchModalOpen={sheet === 'search'}
                setSearchModalOpen={(open) => setSheet(open ? 'search' : null)}
                onSelectRecipe={chooseRecipe}
                meal_type={meal_type}
                date={date}
            />
            <NoteModal
                visible={sheet === 'note'}
                mealName={meal_name}
                onClose={() => setSheet(null)}
                onSave={saveNote}
            />
            <MoveModal
                visible={sheet === 'move'}
                title={summary}
                dates={moveDates}
                currentDate={date}
                currentMealType={meal_type}
                onClose={() => setSheet(null)}
                onMove={moveMeal}
            />
        </View>
    );
};

export default MealPlan;
