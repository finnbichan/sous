import { View, Text, Pressable, SafeAreaView, StyleSheet } from 'react-native';
import React, { useState, useEffect, useContext } from 'react';
import { supabase } from '../../supabase';
import Calendar from '../components/Calendar';
import useStyles from '../styles/Common';
import { AuthContext } from '../../Contexts';

const Home = ({navigation}) => {
    const [name, setName] = useState('');
    const [dataLoading, setDataLoading] = useState(true)
    const styles = useStyles();
    const session = useContext(AuthContext);

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Calendar 
                navigation={navigation}
                />
            </View>
        </SafeAreaView>
    )
}

export default Home;