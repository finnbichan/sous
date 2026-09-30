import React, { useState, useContext, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { CacheContext, ProfileContext } from '../../Contexts';
import { supabase } from '../../supabase';
import AppHeaderText from './AppHeaderText';
import useStyles from '../styles/Common';
import { useTheme } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import GeneratePlanModal from './GeneratePlanModal';

const CalendarHeader = () => {
    const [genModalOpen, setGenModalOpen] = useState(false);
    const styles = useStyles();
    const { colours, assets } = useTheme();
    const { profile } = useContext(ProfileContext);
    const navigation = useNavigation();
    const { cache } = useContext(CacheContext);
    const [sharedWith, setSharedWith] = useState(null);

    // While sharing, the meal plan is the household's; show who it's shared with.
    useEffect(() => {
        let cancelled = false;
        supabase.rpc('get_my_lists').then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
                console.log('Error loading sharing status:', error);
                return;
            }
            setSharedWith(data?.find((list) => list.kind === 'Shared')?.shared_with || null);
        });
        return () => { cancelled = true; };
    }, [cache]);
    const time = Number((new Date).getHours());
    var greeting = "Hey";
    if (time < 12) {greeting = "Morning"}
    else if (time >= 18) {greeting = "Evening"}
    else {greeting = "Afternoon"};
    
    return (
            <View style={headerStyles.container}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8}}>
                    <AppHeaderText>{profile?.display_name ? `${greeting}, ${profile.display_name}` : greeting}</AppHeaderText>
                    <TouchableOpacity
                    style={headerStyles.accountButton}
                    onPress={() => navigation.openDrawer()}
                    >
                        <Image
                        style={headerStyles.accountImage}
                        source={assets.account}
                        />
                    </TouchableOpacity>
                </View>
                <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                    <View>
                        <Text style={{fontSize: 24, color: colours.text, paddingHorizontal: 12, paddingTop: 4}}>
                            {sharedWith ? 'Our meal plan' : 'Your meal plan'}
                        </Text>
                        {sharedWith ? (
                            <Text style={[styles.lowImpactText, {paddingHorizontal: 12}]}>Shared with {sharedWith}</Text>
                        ) : null}
                    </View>
                    <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
                        <TouchableOpacity
                        style={{flexDirection: 'row', padding: 8, marginRight: 12}}
                        onPress={() => setGenModalOpen(true)}
                        >   
                            <Image style={styles.icon} source={assets.calendar_gen}/>
                        </TouchableOpacity>
                    </View>
                </View>
                <GeneratePlanModal
                    genModalOpen={genModalOpen}
                    setGenModalOpen={setGenModalOpen}
                />
            </View>
    );
}; 

const headerStyles = StyleSheet.create({
    container: {
        marginTop: 4,
        marginRight: 4
    },
    accountButton: {
        padding: 6,
        borderRadius: 999
    },
    accountImage: {
        width: 40,
        height: 40,
        borderRadius: 16
    },
    greeting: {
        fontSize: 20,
        marginBottom: 10
    },
    shoppingButton: {
        alignSelf: 'flex-end',
        backgroundColor: '#fff',
        padding: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: '#000',
    },
    shoppingButtonText: {
        color: '#000',
    },
    instructionText: {
        marginTop: 20,
        marginBottom: 10,
        fontSize: 16,
    },
    pickerContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    picker: {
        flex: 1,
        height: 50,
    },
});

export default CalendarHeader;
