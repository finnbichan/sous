import { Modal, Pressable, View, Text, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import React, { useState, useContext, useEffect } from 'react';
import { AuthContext, CacheContext } from '../../Contexts';
import { supabase } from '../../supabase';
import useStyles from '../styles/Common';
import { useTheme } from '@react-navigation/native';
import AppHeaderText from './AppHeaderText';
import Dropdown from './Dropdown';
import AppText from './AppText';
import AppButton from './AppButton';


const GenerateModal = ({ genModalOpen, setGenModalOpen, onGenerated, listId, listName }) => {
    const formatDateValue = (date) => {
        const year = date.getFullYear();
        const month = `${date.getMonth() + 1}`.padStart(2, '0');
        const day = `${date.getDate()}`.padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const formatDateLabel = (dateString) => {
        const [year, month, day] = dateString.split('-').map(Number);
        return new Date(year, month - 1, day).toLocaleDateString([], {
            weekday: 'short',
            day: 'numeric',
            month: 'short'
        });
    };

    const createDateArray = () => {
        let dateArray = [];
        for(let i = 0; i < 14; i++){
            let date = new Date();
            date.setHours(12, 0, 0, 0);
            date.setDate(date.getDate() + i);
            dateArray.push(formatDateValue(date));
        }
        return dateArray;
    };
    const dateArray = createDateArray();
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(dateArray[0]);
    const [endDate, setEndDate] = useState(dateArray[5]);
    const [plannedRecipes, setPlannedRecipes] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const { setCache } = useContext(CacheContext);
    const { colours } = useTheme();
    const styles = useStyles();
     
    const session = useContext(AuthContext);
    const selectedMeals = dateArray
        .slice(dateArray.indexOf(startDate), dateArray.indexOf(endDate) + 1)
        .flatMap((date) => plannedRecipes.filter((plannedRecipe) => plannedRecipe.date == date).map((plannedRecipe) => plannedRecipe.recipe.name));
    const hasMealsIncluded = selectedMeals.length > 0;

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

    const generateList = async () => {
        if (!hasMealsIncluded || !listId || submitting) {
            return;
        }

        setSubmitting(true);
        setErrorMessage('');
        // Adds the planned meals' ingredients to the list shown on the List screen,
        // merging items that are already on it.
        const { data, error } = await supabase.rpc('create_list', {
            p_list_id: listId,
            p_start_date: startDate,
            p_end_date: endDate
        });
        setSubmitting(false);
        if (error) {
            console.error("Error generating shopping list:", error);
            setErrorMessage('Could not add ingredients to your list. Please try again.');
            return;
        }
        if (data?.added === 0 && data?.merged === 0) {
            setErrorMessage('None of these meals have ingredients yet. Add them on each recipe first.');
            return;
        }
        setCache(Date.now());
        if (onGenerated) {
            onGenerated(data);
        }
        setGenModalOpen(false);
    }

    useEffect(() => {
        if (genModalOpen && plannedRecipes) {
            setErrorMessage('');
            setLoading(true);
            getPlannedRecipes();
        }}, [genModalOpen]);

    const modalStyles = StyleSheet.create({
        overlay: {
            height: '100%',
            width: "100%",
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)'
        },
        modal: {
            backgroundColor: colours.background,
            padding: 20,
            width: '90%',
            justifyContent: 'space-evenly',
            alignItems: 'center',
            alignSelf: 'center',
            marginTop: '150',
            position: 'absolute', 
            borderRadius: 8,
            flexGrow: 0
        },
        searchBox: {
            backgroundColor: colours.card,
            borderRadius: 4,
            padding: 2,
            width: '100%',
            height: '50',
            color: colours.text,
            margin: 10,
            paddingHorizontal: 10,
            fontSize: 16
        },
        modalTitle: {
            color: colours.text,
            fontSize: 18,
            marginBottom: 4,
            textAlign: 'left',
        },
        itemContainer: {
            backgroundColor: colours.card,
            borderRadius: 4,
            padding: 4,
            margin: 1,
            flexDirection: 'row',
            flexGrow: 1,
            maxWidth: '99%',
            marginBottom: 2,
            justifyContent: 'space-between',
            alignItems: 'center'
        },
        addIcon: {
            height: 32,
            width: 32,
            marginHorizontal: 8
        },
        recipeContainer: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            width: '100%',
            backgroundColor: colours.card,
            borderRadius: 4,
            marginVertical: 2,
            padding: 4,
            alignItems: 'center'
        }
    })

   if (genModalOpen) {
               return (
                   <Modal 
                   visible={genModalOpen} 
                   animationType='none'
                   transparent
                   >
                       <Pressable
                       style={modalStyles.overlay}
                       onPress={() => {setGenModalOpen(false)}}
                       />
                       <View style={modalStyles.modal}>
                        <AppHeaderText>Generate a list</AppHeaderText>
                        {listName ? (
                            <Text style={[styles.lowImpactText, {alignSelf: 'flex-start', marginLeft: 8}]}>Ingredients will be added to your {listName} list</Text>
                        ) : null}
                        
                            <>
                                <Text style={[styles.lowImpactText, {alignSelf: 'flex-start', marginLeft: 8, marginBottom: '-10'}]}>From</Text>
                                <Dropdown
                                value={0}
                                label="Start date"
                                data={dateArray.map((date, idx) => {
                                    return {id: idx, label: formatDateLabel(date)}
                                })}
                                onSelect={(item) => setStartDate(dateArray[item.id])}
                                />
                                <Text style={[styles.lowImpactText, {alignSelf: 'flex-start', marginBottom: '-10', marginLeft: 8, marginTop: 10}]}>to</Text>
                                <Dropdown
                                value={5}
                                label="End date"
                                data={dateArray.map((date, idx) => {
                                    return {id: idx, label: formatDateLabel(date)}
                                })}
                                onSelect={(item) => setEndDate(dateArray[item.id])}
                                />
                                
                                {loading ? (
                                    <ActivityIndicator />
                                ) : hasMealsIncluded ? (
                                    <View style={{width: '100%', marginLeft: '-8'}}>
                                        <AppText>Meals included:</AppText>
                                        <FlatList
                                            data={dateArray.slice(dateArray.indexOf(startDate), dateArray.indexOf(endDate)+1)}
                                            style={{marginLeft: 16}}
                                            renderItem={(item) => {
                                                const meals = plannedRecipes.filter(d => item.item == d.date).map(r => r.recipe.name)
                                                return (
                                                    <>
                                                    {meals[0] ? (
                                                        <Text style={styles.lowImpactText}>{meals.join(', ')}</Text>
                                                    ) : (
                                                        <></>
                                                    )}
                                                    </>
                                                )
                                            }}
                                        />
                                    </View>
                                ) : null}
                                {errorMessage ? (
                                    <Text style={styles.errorText}>{errorMessage}</Text>
                                ) : null}
                                {submitting ? <ActivityIndicator /> : (
                               <AppButton
                                label="Generate"
                                onPress={generateList}
                                disabled={!hasMealsIncluded}
                                />
                                )}
                            </>
                       </View>
                   </Modal>
               )
           }
}

export default GenerateModal;
