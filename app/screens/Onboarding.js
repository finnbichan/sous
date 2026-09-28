import { View, SafeAreaView, StyleSheet, ActivityIndicator, Text, TouchableOpacity, Image, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useContext, useState } from 'react';
import AppHeaderText from '../components/AppHeaderText';
import AppText from '../components/AppText';
import AppButton from '../components/AppButton';
import { useTheme } from '@react-navigation/native';
import useStyles from '../styles/Common';
import FLTextInput from '../components/FloatingLabelInput';
import { supabase } from '../../supabase';
import { AuthContext, ProfileContext } from '../../Contexts';
import '../../globals';
import Dropdown from '../components/Dropdown';
import Ingredients from '../components/Ingredients';

const portionSizeOptions = [
  { id: 1, label: '1' },
  { id: 2, label: '2' },
  { id: 3, label: '3' },
  { id: 4, label: '4' },
  { id: 5, label: '5' },
  { id: 6, label: '6' },
  { id: 7, label: '7' },
  { id: 8, label: '8' }
];

const Onboarding = ({ navigation }) => {
  const { colours, assets } = useTheme();
  const styles = useStyles();
  const session = useContext(AuthContext);
  const { setProfile } = useContext(ProfileContext);
  const [displayName, setDisplayName] = useState('');
  const [dietary, setDietary] = useState(0);
  const [portionSize, setPortionSize] = useState(null);
  const [allergies, setAllergies] = useState([null]);
  const [dislikes, setDislikes] = useState([null]);
  const [submitting, setSubmitting] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');

  const onboardingStyles = StyleSheet.create({
    container: {
      flex: 1,
      paddingVertical: 40
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'space-between'
    },
    form: {
      width: '100%',
      alignItems: 'center'
    },
    fieldLabel: {
      width: '95%',
      color: colours.secondaryText,
      fontSize: 14,
      marginTop: 6,
      marginBottom: -10,
      marginLeft: 12,
      alignSelf: 'flex-start'
    },
    cameraIcon: {
      position: 'absolute'
    },
    validationText: {
      color: '#b22222',
      alignSelf: 'flex-start',
      marginHorizontal: 12,
      marginTop: 8
    }
  });

  const addAllergy = () => {
    setAllergies([...allergies, null]);
  };

  const updateAllergy = (num, text) => {
    const temp = [...allergies];
    temp[num] = text;
    setAllergies(temp);
  };

  const removeAllergy = (num) => {
    const temp = [...allergies];
    temp.splice(num, 1);
    setAllergies(temp.length ? temp : [null]);
  };

  const addDislike = () => {
    setDislikes([...dislikes, null]);
  };

  const updateDislike = (num, text) => {
    const temp = [...dislikes];
    temp[num] = text;
    setDislikes(temp);
  };

  const removeDislike = (num) => {
    const temp = [...dislikes];
    temp.splice(num, 1);
    setDislikes(temp.length ? temp : [null]);
  };

  const cleanTextArray = (values) => {
    const cleanedValues = values
      .map((value) => value?.trim())
      .filter((value) => value);

    return cleanedValues.length ? cleanedValues : null;
  };

  const submit = async () => {
    const trimmedDisplayName = displayName.trim();

    if (!trimmedDisplayName) {
      setValidationMessage('Please add a display name.');
      return;
    }

    if (portionSize == null) {
      setValidationMessage('Please choose how many people you normally cook for.');
      return;
    }

    setSubmitting(true);
    setValidationMessage('');

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: session.user.id,
        display_name: trimmedDisplayName,
        dietary,
        portion_size: portionSize,
        allergies: cleanTextArray(allergies),
        dislikes: cleanTextArray(dislikes)
      });

    if (profileError) {
      setValidationMessage('Unable to save your display name right now.');
      setSubmitting(false);
      return;
    }

    setProfile({
      display_name: trimmedDisplayName,
      dietary,
      portion_size: portionSize,
      allergies: cleanTextArray(allergies),
      dislikes: cleanTextArray(dislikes)
    });

    setSubmitting(false);
    navigation.replace('Main');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colours.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={onboardingStyles.scrollContent}>
          <View style={[styles.content, onboardingStyles.container]}>
            <View>
              <AppHeaderText>Welcome to Sous</AppHeaderText>
              <AppText>Get started with your meal planning journey</AppText>
            </View>
            <View style={onboardingStyles.form}>
              <FLTextInput
                id="display-name"
                label="Display name"
                defaultValue={displayName}
                onChangeTextProp={setDisplayName}
              />
              <Text style={onboardingStyles.fieldLabel}>Are you vegetarian or vegan?</Text>
              <Dropdown
                data={dietList}
                label="Veggie or vegan?"
                onSelect={(selected) => setDietary(Number(selected.id))}
                value={dietary}
              />
              <Text style={onboardingStyles.fieldLabel}>How many are you normally cooking for?</Text>
              <Dropdown
                data={portionSizeOptions}
                label="Portion size"
                onSelect={(selected) => setPortionSize(Number(selected.id))}
                value={portionSize}
              />
              <Text style={[onboardingStyles.fieldLabel, { marginBottom: 4}]}>Any allergies?</Text>
              <Ingredients
                ingredients={allergies}
                onAddition={addAllergy}
                onChangeText={updateAllergy}
                onRemove={removeAllergy}
                editable={true}
                firstPlaceholder="Add an allergy..."
                nextPlaceholder="Add another allergy..."
              />
              <Text style={[onboardingStyles.fieldLabel, { marginBottom: 4}]}>Any dislikes?</Text>
              <Ingredients
                ingredients={dislikes}
                onAddition={addDislike}
                onChangeText={updateDislike}
                onRemove={removeDislike}
                editable={true}
                firstPlaceholder="Add a dislike..."
                nextPlaceholder="Add another dislike..."
              />
              {validationMessage ? (
                <Text style={onboardingStyles.validationText}>{validationMessage}</Text>
              ) : null}
              {submitting ? (
                <ActivityIndicator style={{ marginTop: 20 }} />
              ) : (
                <AppButton
                  label="Continue"
                  onPress={submit}
                />
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Onboarding;
