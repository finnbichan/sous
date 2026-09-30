import { View, Text, Pressable, TextInput, ActivityIndicator, SafeAreaView, TouchableOpacity, StyleSheet} from 'react-native';
import React, { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import '../../globals';
import Dropdown from '../components/Dropdown';
import FLTextInput from '../components/FloatingLabelInput';
import AppText from '../components/AppText';
import AppHeaderText from '../components/AppHeaderText';
import AppButton from '../components/AppButton';
import { useTheme } from '@react-navigation/native';
import useStyles from '../styles/Common';


const NewUser = ( {navigation} ) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const { colours } = useTheme();
  const styles = useStyles();

  const [errorMessage, setErrorMessage] = useState('');

  const signUp = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }
    setErrorMessage('');
    setLoading(true);
    // supabase-js returns errors instead of throwing, so check the result.
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { shouldCreateUser: true }
    });
    setLoading(false);
    if (error) {
      console.log(error);
      setErrorMessage(error.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : 'We couldn\'t send your code. Please check your email address and try again.');
      return;
    }
    navigation.navigate('Confirm OTP', { email: trimmedEmail });
  }

  const newUserStyles = StyleSheet.create({
    alreadyHaveAccount: {
      marginBottom: 16,
      alignItems: 'flex-start'
    },
    accountText: {
      color: colours.secondaryText,
      fontSize: 14
    },
    loginLink: {
      color: colours.text,
      textDecorationLine: 'underline'
    },
    errorText: {
      color: '#b22222',
      alignSelf: 'flex-start',
      marginHorizontal: 12,
      marginTop: 8
    }
  });

    return (
    <SafeAreaView style={[styles.container, {backgroundColor: colours.background}]}>
      <View style={styles.content}>
        <AppHeaderText>Welcome to sous.</AppHeaderText>
        <AppText>Enter your email address below to get cooking.</AppText>
        <AppText>We'll send you a code to verify your account.</AppText>
        {/* Email and Sign Up */}
        <FLTextInput
        id="email"
        label="Email"
        defaultValue={email}
        onChangeTextProp={setEmail}
        editable={true}
        multiline={false}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="go"
        onSubmitEditing={signUp}
        />
        {errorMessage ? <Text style={newUserStyles.errorText}>{errorMessage}</Text> : null}
        {loading ? <ActivityIndicator /> : (
          <AppButton
          onPress={signUp}
          label="Continue"
          />
        )}
  </View>
</SafeAreaView>
)
}

export default NewUser;