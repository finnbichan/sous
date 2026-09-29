import { View, FlatList, ActivityIndicator, StyleSheet, Text } from 'react-native';
import React, { useContext, useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import CollapsibleSection from './CollapsibleSection';
import CalendarHeader from './CalendarHeader';
import MealPlan from './MealPlan';
import MealPlanSummary from './MealPlanSummary';
import { AuthContext, CacheContext } from '../../Contexts';
import { useTheme } from '@react-navigation/native';
import useStyles from '../styles/Common';
import { nextDays, parseLocalDate, todayLocal } from '../utils/dates';


const calendarStyles = StyleSheet.create({
    parentDateContainer: {
        borderRadius: 4,
        padding: 4,
        marginBottom: 4
    },
    planContainer:{
        marginLeft: '-10'
    }
})


const Calendar = ({navigation}) => {
    const [loading, setLoading] = useState(true);
    const [plannedRecipes, setPlannedRecipes] = useState([]);
    const { cache, setCache } = useContext(CacheContext);
    const session = useContext(AuthContext);
    const {colours} = useTheme();
    const styles = useStyles();

    const addPlannedRecipe = (newRecipe) => {
        if (!newRecipe) return;
        setPlannedRecipes(prevState => {
            const newState = [...prevState, newRecipe];
            return newState;
        });
    }

    const deletePlannedRecipe = (id) => {
        setPlannedRecipes(prevState => {
            const filteredCopy = prevState.filter(item => !(item.plannedrecipe_id === id));
            return filteredCopy;
        });
    }

    const removeAndAddPlannedRecipe = (newRecipe, idToRemove) => {
        deletePlannedRecipe(idToRemove);
        addPlannedRecipe(newRecipe);
    }

    const dateArray = nextDays(14);
    const today = dateArray[0];

    useEffect(() => {
        setLoading(true);
        const getPlannedRecipes = async () => {
            const { data, error } = await supabase.rpc('get_planned_recipes', {
                p_user_id: session.user.id,
                p_start_date: dateArray[0], 
                p_end_date: dateArray[dateArray.length - 1]
            });
            if (error) {
                console.error("Error fetching planned recipes:", error);
            } else {
                setPlannedRecipes(data)
            }
            setLoading(false);
        }
        getPlannedRecipes()
 
    }, [cache, today])

    const renderDate = (mealdate) => {
        const mealdateDateObject = parseLocalDate(mealdate);
        const daysOfTheWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const day = daysOfTheWeek[mealdateDateObject.getDay()];
        const date = mealdateDateObject.toDateString().slice(4, 10);
        const isTodaysMeal = mealdate === todayLocal()
        const breakfast = plannedRecipes.find(({date, meal_type}) => date === mealdate && meal_type === 1)
        const lunch = plannedRecipes.find(({date, meal_type}) => date === mealdate && meal_type === 2)
        const dinner = plannedRecipes.find(({date, meal_type}) => date === mealdate && meal_type === 3)
        return (
            <View style={calendarStyles.parentDateContainer}>
                <CollapsibleSection
                title={isTodaysMeal ? (
                <Text style={{fontSize: 20, color: colours.text}}>Today's menu</Text> 
                ) : (
                    <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
                        <Text style={{fontSize: 20, color: colours.text, paddingEnd: 5}}>{day}</Text>
                        <Text style={styles.lowImpactText}>({date})</Text>
                    </View>
            )}
                open={!isTodaysMeal}
                childrenIfOpen={
                    <View style={calendarStyles.planContainer}>
                        <MealPlan
                        navigation={navigation}
                        meal_type={1}
                        date={mealdate}
                        recipe={breakfast?.recipe || null}
                        note={breakfast?.note}
                        moveDates={dateArray}
                        onPlanChanged={() => setCache(Date.now())}
                        plannedrecipe_id={breakfast?.plannedrecipe_id}
                        addPlannedRecipe={addPlannedRecipe}
                        deletePlannedRecipe={deletePlannedRecipe}
                        rerollPlannedRecipe={removeAndAddPlannedRecipe}
                        editable={true}
                        />
                        <MealPlan
                        navigation={navigation}
                        meal_type={2}
                        date={mealdate}
                        recipe={lunch?.recipe || null}
                        note={lunch?.note}
                        moveDates={dateArray}
                        onPlanChanged={() => setCache(Date.now())}
                        plannedrecipe_id={lunch?.plannedrecipe_id}
                        addPlannedRecipe={addPlannedRecipe}
                        deletePlannedRecipe={deletePlannedRecipe}
                        rerollPlannedRecipe={removeAndAddPlannedRecipe}
                        editable={true}
                        />
                        <MealPlan
                        navigation={navigation}
                        meal_type={3}
                        date={mealdate}
                        recipe={dinner?.recipe || null}
                        note={dinner?.note}
                        moveDates={dateArray}
                        onPlanChanged={() => setCache(Date.now())}
                        plannedrecipe_id={dinner?.plannedrecipe_id}
                        addPlannedRecipe={addPlannedRecipe}
                        deletePlannedRecipe={deletePlannedRecipe}
                        rerollPlannedRecipe={removeAndAddPlannedRecipe}
                        editable={true}
                        />
                    </View>
                }
                childrenIfClosed={
                    <MealPlanSummary
                    breakfast={breakfast?.recipe?.name ?? breakfast?.note ?? null}
                    lunch={lunch?.recipe?.name ?? lunch?.note ?? null}
                    dinner={dinner?.recipe?.name ?? dinner?.note ?? null}
                    />
                }
                />
            </View>
        )
    }
    
    return (
        <View style={{width: '100%'}}>
            {loading ? (
            <View>
                <CalendarHeader/>
                <ActivityIndicator/>  
            </View> 
        ) : (
           <FlatList
                data={dateArray}
                renderItem={({item}) => renderDate(item)}
                style={{marginBottom: '-5'}}
                ListHeaderComponent={<CalendarHeader />}
                // sheets (search, notes) render inside this list; don't eat their first tap
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            /> 
            )}
        </View>
    );
}

export default Calendar;    
