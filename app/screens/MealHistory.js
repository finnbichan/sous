import { SafeAreaView, View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import React, { useCallback, useContext, useEffect, useState } from 'react';
import { useTheme } from '@react-navigation/native';
import { supabase } from '../../supabase';
import { AuthContext, CacheContext } from '../../Contexts';
import useStyles from '../styles/Common';
import AppHeaderText from '../components/AppHeaderText';
import FloatingDrawerButton from '../components/FloatingDrawerButton';
import CollapsibleSection from '../components/CollapsibleSection';
import MealPlan from '../components/MealPlan';
import MealPlanSummary from '../components/MealPlanSummary';
import { formatLocalDate } from '../utils/dates';

const mealHistoryStyles = StyleSheet.create({
    parentDateContainer: {
        borderRadius: 4,
        padding: 4,
        marginBottom: 4
    },
    planContainer: {
        marginLeft: '-10'
    }
});

const buildDateRange = (startDate, endDate) => {
    const dates = [];
    const current = new Date(`${startDate}T00:00:00`);
    const last = new Date(`${endDate}T00:00:00`);

    while (current <= last) {
        dates.push(formatLocalDate(current));
        current.setDate(current.getDate() + 1);
    }

    return dates.reverse();
};

const MealHistory = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [plannedRecipes, setPlannedRecipes] = useState([]);
    const styles = useStyles();
    const { colours } = useTheme();
    const session = useContext(AuthContext);
    const { cache } = useContext(CacheContext);

    const loadHistory = useCallback(async () => {
        if (!session?.user?.id) {
            return;
        }

        setLoading(true);
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const { data, error } = await supabase.rpc('get_planned_recipes', {
            p_user_id: session.user.id,
            p_start_date: '2000-01-01',
            p_end_date: formatLocalDate(yesterday)
        });

        if (error) {
            console.error('Error fetching meal history:', error);
            setPlannedRecipes([]);
            setLoading(false);
            return;
        }

        const sortedData = [...(data || [])].sort((a, b) => {
            if (a.date === b.date) {
                return a.meal_type - b.meal_type;
            }
            return a.date < b.date ? 1 : -1;
        });

        setPlannedRecipes(sortedData);
        setLoading(false);
    }, [session?.user?.id]);

    useEffect(() => {
        loadHistory();
    }, [loadHistory, cache]);

    const dateArray = React.useMemo(() => {
        if (plannedRecipes.length === 0) {
            return [];
        }

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const earliestDate = plannedRecipes.reduce((earliest, item) => (
            item.date < earliest ? item.date : earliest
        ), plannedRecipes[0].date);

        return buildDateRange(earliestDate, formatLocalDate(yesterday));
    }, [plannedRecipes]);

    const renderDate = ({ item: mealdate }) => {
        const mealdateDateObject = new Date(`${mealdate}T00:00:00`);
        const daysOfTheWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const day = daysOfTheWeek[mealdateDateObject.getDay()];
        const date = mealdateDateObject.toDateString().slice(4, 10);
        const breakfast = plannedRecipes.find(({ date: recipeDate, meal_type }) => recipeDate === mealdate && meal_type === 1);
        const lunch = plannedRecipes.find(({ date: recipeDate, meal_type }) => recipeDate === mealdate && meal_type === 2);
        const dinner = plannedRecipes.find(({ date: recipeDate, meal_type }) => recipeDate === mealdate && meal_type === 3);

        return (
            <View style={mealHistoryStyles.parentDateContainer}>
                <CollapsibleSection
                    title={(
                        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                            <Text style={{ fontSize: 20, color: colours.text, paddingEnd: 5 }}>{day}</Text>
                            <Text style={styles.lowImpactText}>({date})</Text>
                        </View>
                    )}
                    open={true}
                    childrenIfOpen={
                        <View style={mealHistoryStyles.planContainer}>
                            <MealPlan
                                navigation={navigation}
                                meal_type={1}
                                date={mealdate}
                                recipe={breakfast?.recipe || null}
                                plannedrecipe_id={breakfast?.plannedrecipe_id}
                                editable={false}
                            />
                            <MealPlan
                                navigation={navigation}
                                meal_type={2}
                                date={mealdate}
                                recipe={lunch?.recipe || null}
                                plannedrecipe_id={lunch?.plannedrecipe_id}
                                editable={false}
                            />
                            <MealPlan
                                navigation={navigation}
                                meal_type={3}
                                date={mealdate}
                                recipe={dinner?.recipe || null}
                                plannedrecipe_id={dinner?.plannedrecipe_id}
                                editable={false}
                            />
                        </View>
                    }
                    childrenIfClosed={(
                        <MealPlanSummary
                            breakfast={breakfast?.recipe || null}
                            lunch={lunch?.recipe || null}
                            dinner={dinner?.recipe || null}
                        />
                    )}
                />
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <FloatingDrawerButton />
            <View style={[styles.content, { width: '100%', alignItems: 'flex-start', paddingHorizontal: 8, paddingTop: 10 }]}>
                <AppHeaderText>Meal History</AppHeaderText>
                {loading ? (
                    <View style={{ width: '100%', paddingTop: 24, alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={colours.text} />
                    </View>
                ) : dateArray.length === 0 ? (
                    <Text style={[styles.lowImpactText, { marginTop: 8 }]}>No meal history yet.</Text>
                ) : (
                    <FlatList
                        data={dateArray}
                        renderItem={renderDate}
                        keyExtractor={(item) => item}
                        style={{ width: '100%', marginTop: 12 }}
                        contentContainerStyle={{ paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                    />
                )}
            </View>
        </SafeAreaView>
    );
};

export default MealHistory;
