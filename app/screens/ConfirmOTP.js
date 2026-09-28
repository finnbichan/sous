import { View, Text, Pressable, TextInput, ActivityIndicator, SafeAreaView, TouchableOpacity} from 'react-native';
import React, { useState } from 'react';
import { supabase } from '../../supabase';
import useStyles from '../styles/Common';
import AppText from '../components/AppText';
import AppHeaderText from '../components/AppHeaderText';
import FLTextInput from '../components/FloatingLabelInput';
import AppButton from '../components/AppButton';

const ConfirmOTP = ({ route }) => {
  const styles = useStyles();
  const [OTP, setOTP] = useState('');
  const [loading, setLoading] = useState(false);
  const { email } = route.params;
  const [errorMessage, setErrorMessage] = useState('');

  const submitOTP = async () => {
    const token = OTP.trim();
    if (!token) {
      setErrorMessage('Please enter the code from your email.');
      return;
    }
    setErrorMessage('');
    setLoading(true)
    // On success the auth listener in App.js switches to the signed-in screens.
    const { error } = await supabase.auth.verifyOtp({
      email: email,
      token: token,
      type: 'email'
    })
    setLoading(false)
    if (error) {
      console.log(error)
      setErrorMessage('That code is incorrect or has expired. Check your email or go back to request a new one.')
    }
  }
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <AppHeaderText>Check your email</AppHeaderText>
        <AppText>We've sent a code to {email}. Type it in below to get cooking.</AppText>
        <FLTextInput
        id="otp"
        label="Code"
        onChangeTextProp={(text) => setOTP(text)}
        multiline={false}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="go"
        onSubmitEditing={submitOTP}
        />
        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
        { loading ? <ActivityIndicator/>
        : (
        <AppButton
        label="Submit"
        onPress={submitOTP}
        />
        )}
  </View>
</SafeAreaView>
)
}

export default ConfirmOTP;