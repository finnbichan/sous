import React, { useState, useContext } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { styles } from '../styles/Common';
import { supabase } from '../../supabase';
import { AuthContext } from '../../Contexts';
import RecipeBase from './RecipeBase';
import SearchModal from './SearchModal';
import { useTheme } from '@react-navigation/native';

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
    header: {
        backgroundColor: props.colours.card,
        padding: 10,
    },
    title: {
        fontSize: 16,
        color: props.colours.text,
    },
    content: {
        padding: 10,
    },
    image: {
        height: 36,
        width: 36,
        marginHorizontal: 8
    },
    noPlanContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '99%'
    },
    noPlanButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        width: 100
    },
    noPlanText: {
        color: props.colours.text,
        fontSize: 18,
        paddingLeft: 0,
        paddingBottom: 4
    },
    lowImpactText: {
        color: props.colours.secondaryText,
        marginTop: -4
    },
    yesPlanTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '99%',
        marginTop: 4,
        marginBottom: 4
    },
    yesPlanLeftSection: {
        flexGrow: 1,
        maxWidth: '73%',
    }
});

function useMealPlanStyles() {
    const { colours } = useTheme();
    const mealPlanstyles = React.useMemo(() => MealPlanStyles({ colours }), [colours]);
    return mealPlanstyles;
  }

const NoPlan = ({ meal_name, date, meal_type, user_id, addPlannedRecipe, editable }) => {
    const { assets } = useTheme(); 
    const mealPlanStyles = useMealPlanStyles();

    
    const [newMealLoading, setNewMealLoading] = useState(false);
    const [searchModalOpen, setSearchModalOpen] = useState(false);

    const session = useContext(AuthContext);

    const suggestRecipe = async (meal_type, date, user_id) => {
        setNewMealLoading(true);
        const {data, error} = await supabase.rpc('suggest_recipe', {p_mealtype: meal_type, p_date:date, p_user_id: user_id})
        setNewMealLoading(false);
        if (error) {
            console.log(error);
            showPlanError();
        } else if (!data) {
            showNoRecipe(meal_name);
        } else {
            addPlannedRecipe(data);
        }
    }

    const addRecipeBySearch = async (recipe, meal_type, date) => {
        setNewMealLoading(true);
        const {data, error} = await supabase.rpc('add_single_planned_recipe', 
            {p_mealtype: meal_type, p_date:date, p_user_id: session.user.id, p_recipe_id: recipe.recipe_id})
        setNewMealLoading(false);
        if (error || !data) {
            console.log(error);
            showPlanError();
        } else {
            addPlannedRecipe(data);
        }
    }

    return (
        <View>
            <SearchModal
            searchModalOpen={searchModalOpen}
            setSearchModalOpen={setSearchModalOpen}
            onSelectRecipe={addRecipeBySearch}
            meal_type={meal_type}
            date={date}
            />
            {newMealLoading ? (
                <>
                    <Text style={mealPlanStyles.lowImpactText}>{meal_name}</Text>
                    <ActivityIndicator style={{paddingBottom: 10}}/>
                </>
            ) : (
            <View style={mealPlanStyles.noPlanContainer}>
                <View>
                    <Text style={mealPlanStyles.lowImpactText}>{meal_name}</Text>
                    <Text style={mealPlanStyles.noPlanText}>Nothing planned</Text>
                </View>
                {editable ? ( 
                <View style={mealPlanStyles.noPlanButtons}>
                    <TouchableOpacity
                    onPress={() => setSearchModalOpen(true)}>
                        <Image
                        style={mealPlanStyles.image}
                        source={assets.search}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                    onPress={() => suggestRecipe(meal_type, date, user_id)}
                    >
                        <Image
                        style={mealPlanStyles.image}
                        source={assets.bolt}
                        />
                    </TouchableOpacity>
                </View>
                ) : (<></>)}
            </View>
            )}
        </View>
    )
}

const YesPlan = ({navigation, user_id, meal_name, meal_type, recipe, date, plannedrecipe_id, deletePlannedRecipe, rerollPlannedRecipe, editable}) => {
    const [loading, setLoading] = useState(false)
    const { assets } = useTheme();
    const mealPlanStyles = useMealPlanStyles();
    const deactivatePlannedRecipe = async () => {
        setLoading(true)
        const {error} = await supabase
        .from('plannedrecipes')
        .update({active: false})
        .eq('id', plannedrecipe_id)
        if (error) {
            console.log("error", error);
            showPlanError();
        } else {
            deletePlannedRecipe(plannedrecipe_id);
        }
        setLoading(false);
    }
    const rerollRecipe = async (meal_type, date, user_id, plannedrecipe_id) => {
        setLoading(true)
        // Suggest first so a failed or empty suggestion leaves the current meal in place.
        const { data: suggest_data, error: suggest_error } = await supabase.rpc('suggest_recipe', {p_mealtype: meal_type, p_date:date, p_user_id: user_id})
        if (suggest_error) {
            console.log(suggest_error);
            showPlanError();
        } else if (!suggest_data) {
            showNoRecipe(meal_name);
        } else {
            const { error: delete_error } = await supabase
            .from('plannedrecipes')
            .update({active: false})
            .eq('id', plannedrecipe_id)
            if (delete_error) {
                console.log("error", delete_error);
            }
            rerollPlannedRecipe(suggest_data, plannedrecipe_id);
        }
        setLoading(false)
    }
    return (
        <View>
            {loading ? (
                <>
                    <Text style={mealPlanStyles.lowImpactText}>{meal_name}</Text>
                    <ActivityIndicator style={{paddingBottom: 10}}/>
                </>
            ) : (
            <View style={mealPlanStyles.yesPlanTopRow}>
                <TouchableOpacity
                onPress={()=>{
                    navigation.navigate("Recipe", {prevScreen: 'Home', recipe: recipe});
                }}
                style={mealPlanStyles.yesPlanLeftSection}
                >
                    <Text style={mealPlanStyles.lowImpactText}>{meal_name}</Text>
                    <RecipeBase
                    recipe={recipe}
                    />
                </TouchableOpacity>
                { editable ? (
                <View style={mealPlanStyles.noPlanButtons}>
                    <TouchableOpacity
                    onPress={deactivatePlannedRecipe}
                    
                    >
                        <Image
                        style={mealPlanStyles.image}
                        source={assets.cross}
                        />
                    </TouchableOpacity>
                    <TouchableOpacity
                    onPress={() => rerollRecipe(meal_type, date, user_id, plannedrecipe_id)}
                    >
                        <Image
                        style={mealPlanStyles.image}
                        source={assets.refresh}
                        /> 
                    </TouchableOpacity>
                </View>
                ) : (<></>)}
            </View>
            )}
        </View>
    )
}

const MealPlan = ({ navigation, meal_type, date, recipe, plannedrecipe_id, addPlannedRecipe, deletePlannedRecipe, rerollPlannedRecipe, editable }) => {
    const session = useContext(AuthContext)
    const mealPlanStyles = useMealPlanStyles();
    var meal_name = null;
    switch(meal_type) {
        case(1) : {meal_name="Breakfast"; break;}
        case(2) : {meal_name="Lunch"; break;}
        case(3) : {meal_name="Dinner"; break;}
        default : {meal_name="Unknown Meal"}
    }
    return (
        <View style={mealPlanStyles.container}>
            {recipe === null ? (
                <NoPlan
                user_id={session.user.id}
                meal_name={meal_name}
                meal_type={meal_type}
                date={date}
                addPlannedRecipe={addPlannedRecipe}
                editable={editable}
                />
            ) : (
                <YesPlan
                navigation={navigation}
                user_id={session.user.id}
                meal_name={meal_name}
                meal_type={meal_type}
                recipe={recipe}
                date={date}
                plannedrecipe_id={plannedrecipe_id}
                addPlannedRecipe={addPlannedRecipe}
                deletePlannedRecipe={deletePlannedRecipe}
                rerollPlannedRecipe={rerollPlannedRecipe}
                editable={editable}
                />
            )}
        </View>
    );
};


export default MealPlan;