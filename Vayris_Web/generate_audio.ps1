Add-Type -AssemblyName System.speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.SetOutputToWaveFile("e:\Jarvis\ui\hey_buddy.wav")
$synth.Speak("Hey Buddy")
$synth.Dispose()