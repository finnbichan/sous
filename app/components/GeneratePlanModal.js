import { Modal, Pressable, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import React, { useState, useContext } from 'react';
import { AuthContext, CacheContext } from '../../Contexts';
import { supabase } from '../../supabase';
import useStyles from '../styles/Common';
import { useTheme } from '@react-navigation/native';
import AppHeaderText from './AppHeaderText';
import Dropdown from './Dropdown';
import AppButton from './AppButton';
import { nextDays, parseLocalDate } from '../utils/dates';


const GeneratePlanModal = ({genModalOpen, setGenModalOpen}) => {
    const dateArray = nextDays(14);
    const [startDate, setStartDate] = useState(dateArray[0]);
    const [endDate, setEndDate] = useState(dateArray[5]);
    const [submitting, setSubmitting] = useState(false);
    const {setCache} = useContext(CacheContext);
    const { assets, colours } = useTheme();
    const styles = useStyles();
     
    const session = useContext(AuthContext);

    const generatePlan = async () => {
        setSubmitting(true);
        const { data, error } = await supabase.rpc('generate_mealplans_between_dates', {
            p_user_id: session.user.id,
            p_start_date: startDate,
            p_end_date: endDate
        });
        if (error) {
            console.error("Error generating meal plan:", error);
        } else {
            setCache(Date.now());
            console.log('Generated meal plan:', data, data.list_name);
        }
        setSubmitting(false);
        setGenModalOpen(false);
    }

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
                        <AppHeaderText>Generate a meal plan</AppHeaderText>
                        
                            <>
                                <Text style={[styles.lowImpactText, {alignSelf: 'flex-start', marginLeft: 8, marginBottom: '-10'}]}>From</Text>
                                <Dropdown
                                value={0}
                                label="Start date"
                                data={dateArray.map((date, idx) => {
                                    const dateObj = parseLocalDate(date);
                                    const formatted = dateObj.toLocaleDateString('en-GB', { 
                                        weekday: 'long',
                                        month: 'short', 
                                        day: 'numeric' 
                                    });
                                    return {id: idx, label: formatted}
                                })}
                                onSelect={(item) => setStartDate(dateArray[item.id])}
                                />
                                <Text style={[styles.lowImpactText, {alignSelf: 'flex-start', marginBottom: '-10', marginLeft: 8, marginTop: 10}]}>to</Text>
                                <Dropdown
                                value={5}
                                label="End date"
                                data={dateArray.map((date, idx) => {
                                    const dateObj = parseLocalDate(date);
                                    const formatted = dateObj.toLocaleDateString('en-GB', { 
                                        weekday: 'long',
                                        month: 'short',
                                        day: 'numeric'
                                    });
                                    return {id: idx, label: formatted}
                                })}
                                onSelect={(item) => setEndDate(dateArray[item.id])}
                                />
                                
                                {submitting ? <ActivityIndicator /> : (
                               <AppButton
                                label="Generate"
                                onPress={generatePlan}
                                />
                                )}
                            </>
                       </View>
                   </Modal>
               )
           }
}

export default GeneratePlanModal;